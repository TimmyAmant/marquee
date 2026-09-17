import Foundation
import Observation

/// Finds Marquee servers on the local network: every host in the Mac's
/// subnet(s) on the Docker default port 3000, then a second pass on the
/// ports people commonly remap it to, plus Unraid's default `tower.local`.
///
/// Each address gets a ~500 ms TCP connect check first; only open ports get
/// the `server-info` HTTP probe. Work runs on a fixed pool of unstructured
/// worker tasks pulling from one queue (a task group with main-actor children
/// trips Swift 6.4's region-isolation checker).
@MainActor
@Observable
final class ServerDiscovery {
    enum State: Equatable {
        case idle
        /// Making sure macOS allows local network connections (its prompt may be up).
        case checkingAccess
        case scanning
        /// Local Network privacy is blocking Marquee. Discovery keeps checking
        /// and resumes on its own once access is turned on.
        case localNetworkDenied
        case finished
    }

    struct FoundServer: Identifiable, Hashable, Sendable {
        enum Kind: Hashable, Sendable {
            case current(ServerInfo)
            /// Older than 0.22.0: no v1 API yet.
            case legacy
            /// Newer API than this app speaks.
            case incompatible(ServerInfo)
        }

        let address: ServerAddress
        let kind: Kind
        /// What the address connected to, so `tower.local:3000` and
        /// `192.168.1.20:3000` show up as one server.
        let resolvedIPv4: String?

        var id: String { address.baseURLString }

        var info: ServerInfo? {
            switch kind {
            case let .current(info), let .incompatible(info): return info
            case .legacy: return nil
            }
        }

        var isUsable: Bool {
            if case .current = kind { return true }
            return false
        }

        /// Which duplicate to keep: a name survives DHCP changes, an IP beats localhost.
        fileprivate var displayRank: Int {
            if address.isLoopback { return 2 }
            return address.isIPLiteral ? 1 : 0
        }
    }

    private struct Candidate: Sendable {
        let address: ServerAddress
        let connectTimeout: Duration
    }

    private enum CandidateResult: Sendable {
        case nothing
        case denied
        case found(FoundServer)
    }

    nonisolated static let primaryPort = ServerAddress.defaultPort
    nonisolated static let fallbackPorts = [80, 8080, 3001, 8000]
    /// Unraid's default host name.
    nonisolated static let unraidHostName = "tower.local"
    nonisolated static let maxConcurrency = 56
    nonisolated static let connectTimeout: Duration = .milliseconds(500)
    /// `.local` names need an mDNS lookup before the connect.
    nonisolated static let hostNameConnectTimeout: Duration = .milliseconds(2500)
    nonisolated static let requestTimeout: TimeInterval = 3

    private(set) var state: State = .idle
    private(set) var probed = 0
    private(set) var total = 0
    private(set) var found: [FoundServer] = []
    private(set) var interfaces: [IPv4Interface] = []
    /// True when the last scan ended through `stop()` rather than running out of addresses.
    private(set) var wasStopped = false

    /// Fires after every state change (the connect flow moves between steps on these).
    @ObservationIgnored var onStateChange: ((State) -> Void)?

    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var queue: [Candidate] = []
    @ObservationIgnored private var nextIndex = 0
    @ObservationIgnored private var tasks: [Task<Void, Never>] = []
    @ObservationIgnored private var localAddresses: Set<String> = []

    var isRunning: Bool { state == .checkingAccess || state == .scanning }

    var fractionComplete: Double {
        total == 0 ? 0 : min(1, Double(probed) / Double(total))
    }

    /// `192.168.1.0/24`, or a list when the Mac is on several networks.
    var networkSummary: String? {
        guard !interfaces.isEmpty else { return nil }
        return interfaces.map(\.subnetDescription).joined(separator: ", ")
    }

    // MARK: Control

    func start() {
        cancelTasks()
        generation &+= 1
        let generation = self.generation
        probed = 0
        total = 0
        found = []
        wasStopped = false
        interfaces = NetworkInterfaces.activeIPv4()
        localAddresses = Set(interfaces.map(\.addressString))
        setState(.checkingAccess)

        let accessHost = accessCheckHost()
        tasks = [Task {
            if let accessHost {
                // The first LAN connection is also what makes macOS show its
                // Local Network prompt.
                let access = await LocalNetworkAccess.check(host: accessHost)
                guard generation == self.generation, !Task.isCancelled else { return }
                if access == .denied {
                    self.enterDenied(generation: generation)
                    return
                }
            }
            self.beginScan(generation: generation)
        }]
    }

    /// Ends the scan early, keeping whatever was found.
    func stop() {
        guard isRunning || state == .localNetworkDenied else { return }
        let wasScanning = state == .scanning
        cancelTasks()
        generation &+= 1
        wasStopped = true
        setState(wasScanning ? .finished : .idle)
    }

    /// Stops everything and forgets the results.
    func reset() {
        cancelTasks()
        generation &+= 1
        probed = 0
        total = 0
        found = []
        wasStopped = false
        setState(.idle)
    }

    // MARK: Scan

    private func beginScan(generation: Int) {
        guard generation == self.generation else { return }
        let hosts = NetworkInterfaces.scanHosts(for: interfaces).map(IPv4.string)

        var candidates = [
            Candidate(address: ServerAddress(host: "localhost", port: Self.primaryPort), connectTimeout: Self.connectTimeout),
            Candidate(address: ServerAddress(host: Self.unraidHostName, port: Self.primaryPort), connectTimeout: Self.hostNameConnectTimeout),
        ]
        candidates += hosts.map {
            Candidate(address: ServerAddress(host: $0, port: Self.primaryPort), connectTimeout: Self.connectTimeout)
        }
        for host in hosts {
            candidates += Self.fallbackPorts.map {
                Candidate(address: ServerAddress(host: host, port: $0), connectTimeout: Self.connectTimeout)
            }
        }

        queue = candidates
        nextIndex = 0
        total = candidates.count
        setState(.scanning)

        let workers = (0..<min(Self.maxConcurrency, candidates.count)).map { _ in
            Task { await self.work(generation: generation) }
        }
        let coordinator = Task {
            for worker in workers {
                await worker.value
            }
            guard generation == self.generation, self.state == .scanning else { return }
            self.queue = []
            self.setState(.finished)
        }
        tasks = workers + [coordinator]
    }

    private func work(generation: Int) async {
        while generation == self.generation, !Task.isCancelled, nextIndex < queue.count {
            let candidate = queue[nextIndex]
            nextIndex += 1
            let result = await Self.probe(candidate)
            guard generation == self.generation, !Task.isCancelled else { return }
            probed += 1
            switch result {
            case .nothing:
                break
            case .denied:
                enterDenied(generation: generation)
                return
            case let .found(server):
                merge(server)
            }
        }
    }

    @concurrent
    private nonisolated static func probe(_ candidate: Candidate) async -> CandidateResult {
        let address = candidate.address
        switch await TCPProbe.check(host: address.host, port: address.effectivePort, timeout: candidate.connectTimeout) {
        case let .open(resolvedIPv4):
            let kind: FoundServer.Kind
            switch await ServerProbe.fetchInfo(address, timeout: requestTimeout) {
            case let .marquee(info): kind = .current(info)
            case .legacy: kind = .legacy
            case let .incompatible(info): kind = .incompatible(info)
            case .notMarquee, .unreachable: return .nothing
            }
            let ip = resolvedIPv4 ?? (address.isIPLiteral ? address.host : nil)
            return .found(FoundServer(address: address, kind: kind, resolvedIPv4: ip))
        case .localNetworkDenied:
            return .denied
        case .refused, .noResponse, .unknownHost:
            return .nothing
        }
    }

    private func merge(_ server: FoundServer) {
        let key = endpointKey(server)
        if let index = found.firstIndex(where: { $0.id == server.id || endpointKey($0) == key }) {
            if server.displayRank < found[index].displayRank {
                found[index] = server
            }
            return
        }
        found.append(server)
    }

    /// The Mac's own addresses and loopback all mean "this Mac".
    private func endpointKey(_ server: FoundServer) -> String {
        let port = server.address.effectivePort
        guard let ip = server.resolvedIPv4 else { return server.id }
        if ip.hasPrefix("127.") || localAddresses.contains(ip) {
            return "this-mac:\(port)"
        }
        return "\(ip):\(port)"
    }

    // MARK: Local Network permission

    /// Probably the router: the first host address that isn't this Mac.
    private func accessCheckHost() -> String? {
        guard let interface = interfaces.first else { return nil }
        return NetworkInterfaces.scanHosts(for: interface)
            .first { $0 != interface.address }
            .map(IPv4.string)
    }

    private func enterDenied(generation: Int) {
        guard generation == self.generation, state != .localNetworkDenied else { return }
        cancelTasks()
        setState(.localNetworkDenied)
        watchForAccess(generation: generation)
    }

    /// While blocked, re-check every couple of seconds and start over once
    /// access is on (Allow clicked, or the System Settings switch flipped).
    private func watchForAccess(generation: Int) {
        guard let host = accessCheckHost() else { return }
        tasks = [Task {
            while generation == self.generation, !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2))
                guard generation == self.generation, !Task.isCancelled else { return }
                let access = await LocalNetworkAccess.check(host: host, decideAfter: .milliseconds(800), deniedGrace: .milliseconds(1200))
                guard generation == self.generation, !Task.isCancelled else { return }
                if access != .denied {
                    self.start()
                    return
                }
            }
        }]
    }

    // MARK: Helpers

    private func cancelTasks() {
        for task in tasks {
            task.cancel()
        }
        tasks = []
        queue = []
        nextIndex = 0
    }

    private func setState(_ newState: State) {
        guard state != newState else { return }
        state = newState
        onStateChange?(newState)
    }
}
