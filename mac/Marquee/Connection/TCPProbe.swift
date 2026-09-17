import Foundation
import Network
import Synchronization

/// A cheap TCP connect check (Network.framework) that gates the HTTP probe
/// during discovery, so a thousand silent LAN addresses cost half a second
/// each instead of a full URLSession timeout.
enum TCPProbe {
    enum Result: Equatable, Sendable {
        /// Connected. For host names, the IPv4 address it resolved to.
        case open(resolvedIPv4: String?)
        case refused
        case noResponse
        case unknownHost
        case localNetworkDenied
    }

    static let queue = DispatchQueue(label: "com.timmyamant.Marquee.tcp-probe", attributes: .concurrent)

    /// `kDNSServiceErr_PolicyDenied` from dns_sd.h: a name lookup macOS refused.
    static let dnsPolicyDenied: DNSServiceErrorType = -65_570

    @concurrent
    static func check(host: String, port: Int, timeout: Duration, ipv4Only: Bool = true) async -> Result {
        guard let nwPort = NWEndpoint.Port(rawValue: UInt16(clamping: port)) else { return .noResponse }
        let connection = NWConnection(host: NWEndpoint.Host(host), port: nwPort, using: parameters(ipv4Only: ipv4Only))
        let completion = OneShot<Result>()
        let finish: @Sendable (Result) -> Void = { result in
            if completion.finish(result) { connection.cancel() }
        }

        return await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                completion.install(continuation)
                guard !completion.isFinished else { return }
                connection.stateUpdateHandler = { state in
                    switch state {
                    case .ready:
                        finish(.open(resolvedIPv4: resolvedIPv4(connection.currentPath)))
                    case let .waiting(error), let .failed(error):
                        // Network.framework parks a refused or unroutable
                        // connection in .waiting to retry; for a probe that's
                        // already the answer.
                        finish(classify(error, path: connection.currentPath))
                    default:
                        break
                    }
                }
                connection.start(queue: queue)
                queue.asyncAfter(deadline: .now() + timeout.timeInterval) {
                    finish(.noResponse)
                }
            }
        } onCancel: {
            finish(.noResponse)
        }
    }

    static func parameters(ipv4Only: Bool) -> NWParameters {
        let parameters = NWParameters.tcp
        if ipv4Only, let ip = parameters.defaultProtocolStack.internetProtocol as? NWProtocolIP.Options {
            // Subnet scans are IPv4, and resolving `tower.local` to IPv4 lets
            // it dedupe against the same server found by address.
            ip.version = .v4
        }
        return parameters
    }

    static func classify(_ error: NWError, path: NWPath?) -> Result {
        if isLocalNetworkDenied(error, path: path) { return .localNetworkDenied }
        switch error {
        case let .posix(code):
            switch code {
            case .ECONNREFUSED, .ECONNRESET:
                return .refused
            default:
                return .noResponse
            }
        case .dns:
            return .unknownHost
        default:
            return .noResponse
        }
    }

    /// How macOS 15 reports a Local Network privacy block: the path is
    /// unsatisfied with `.localNetworkDenied` (the connection sits in
    /// `.waiting`), or, for a `.local` name, the lookup fails with PolicyDenied.
    static func isLocalNetworkDenied(_ error: NWError?, path: NWPath?) -> Bool {
        if let path, path.status != .satisfied, path.unsatisfiedReason == .localNetworkDenied {
            return true
        }
        if case let .dns(code)? = error, code == dnsPolicyDenied {
            return true
        }
        return false
    }

    static func resolvedIPv4(_ path: NWPath?) -> String? {
        guard case let .hostPort(host, _)? = path?.remoteEndpoint, case let .ipv4(address) = host else { return nil }
        let bytes = [UInt8](address.rawValue)
        guard bytes.count == 4 else { return nil }
        return IPv4.string(bytes.reduce(0) { $0 << 8 | UInt32($1) })
    }
}

/// Whether macOS currently lets Marquee talk to the local network. There's no
/// API to ask, so this opens a connection to a LAN address and watches how
/// Network.framework treats it.
enum LocalNetworkAccess: Equatable, Sendable {
    case granted
    case denied
    /// The target never answered either way (a silent host); scanning can go ahead.
    case undetermined

    /// - Parameters:
    ///   - decideAfter: With no sign of a block by then, report `.undetermined`.
    ///   - deniedGrace: How long a blocked connection may stay blocked before
    ///     reporting `.denied`. The first time, macOS shows its Local Network
    ///     prompt while the connection waits, and clicking Allow unblocks it.
    @concurrent
    static func check(
        host: String,
        port: Int = 80,
        decideAfter: Duration = .milliseconds(1200),
        deniedGrace: Duration = .seconds(3)
    ) async -> LocalNetworkAccess {
        guard let nwPort = NWEndpoint.Port(rawValue: UInt16(clamping: port)) else { return .undetermined }
        let connection = NWConnection(host: NWEndpoint.Host(host), port: nwPort, using: TCPProbe.parameters(ipv4Only: true))
        let completion = OneShot<LocalNetworkAccess>()
        let blocked = Mutex(false)
        let finish: @Sendable (LocalNetworkAccess) -> Void = { result in
            if completion.finish(result) { connection.cancel() }
        }

        return await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                completion.install(continuation)
                guard !completion.isFinished else { return }
                connection.pathUpdateHandler = { path in
                    blocked.withLock { $0 = TCPProbe.isLocalNetworkDenied(nil, path: path) }
                }
                connection.stateUpdateHandler = { state in
                    switch state {
                    case .ready:
                        finish(.granted)
                    case let .waiting(error):
                        if TCPProbe.isLocalNetworkDenied(error, path: connection.currentPath) {
                            blocked.withLock { $0 = true }
                        } else {
                            // Refused or unroutable means packets flowed.
                            finish(.granted)
                        }
                    case let .failed(error):
                        finish(TCPProbe.isLocalNetworkDenied(error, path: connection.currentPath) ? .denied : .granted)
                    case .preparing:
                        if connection.currentPath?.status == .satisfied {
                            blocked.withLock { $0 = false }
                        }
                    default:
                        break
                    }
                }
                connection.start(queue: TCPProbe.queue)
                TCPProbe.queue.asyncAfter(deadline: .now() + decideAfter.timeInterval) {
                    if !blocked.withLock({ $0 }) { finish(.undetermined) }
                }
                TCPProbe.queue.asyncAfter(deadline: .now() + deniedGrace.timeInterval) {
                    finish(blocked.withLock { $0 } ? .denied : .undetermined)
                }
            }
        } onCancel: {
            finish(.undetermined)
        }
    }
}

/// Resumes a continuation exactly once, whichever of the state handler,
/// timeout or task cancellation gets there first.
final class OneShot<Value: Sendable>: Sendable {
    private struct State {
        var continuation: CheckedContinuation<Value, Never>?
        var value: Value?
        var finished = false
    }

    private let state = Mutex(State())

    var isFinished: Bool { state.withLock { $0.finished } }

    func install(_ continuation: CheckedContinuation<Value, Never>) {
        let early: Value? = state.withLock { state in
            if state.finished { return state.value }
            state.continuation = continuation
            return nil
        }
        if let early { continuation.resume(returning: early) }
    }

    /// Returns true for the call that actually finished it.
    @discardableResult
    func finish(_ value: Value) -> Bool {
        let (won, continuation) = state.withLock { state -> (Bool, CheckedContinuation<Value, Never>?) in
            guard !state.finished else { return (false, nil) }
            state.finished = true
            if let continuation = state.continuation {
                state.continuation = nil
                return (true, continuation)
            }
            state.value = value
            return (true, nil)
        }
        continuation?.resume(returning: value)
        return won
    }
}

extension Duration {
    var timeInterval: TimeInterval {
        let (seconds, attoseconds) = components
        return TimeInterval(seconds) + TimeInterval(attoseconds) / 1e18
    }
}
