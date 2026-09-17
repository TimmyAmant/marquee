import SwiftUI
import Observation
import AppKit

/// State for the find-your-server flow: Welcome → Searching → (Local Network
/// denied) → Manual entry. Picking a server hands it to `AppModel` via `onSelect`.
@MainActor
@Observable
final class ConnectModel {
    enum Step: Equatable {
        case welcome
        case searching
        case localNetworkDenied
        case manual
    }

    static let nothingFoundMessage = "We couldn't find a Marquee server on your network."

    var step: Step = .welcome
    let discovery = ServerDiscovery()

    var manualAddress = ""
    var manualError: String?
    /// Shown above the field, e.g. when a search came up empty.
    var manualNotice: String?
    /// The last manual attempt was blocked by Local Network privacy.
    var manualNeedsLocalNetwork = false
    private(set) var isConnecting = false

    /// A usable server was chosen (it has already answered server-info).
    @ObservationIgnored var onSelect: ((ServerAddress, ServerInfo) -> Void)?
    @ObservationIgnored private var connectTask: Task<Void, Never>?

    init() {
        discovery.onStateChange = { [weak self] state in
            self?.discoveryChanged(state)
        }
    }

    /// Back to Welcome. `prefill` seeds the manual field (the previous server
    /// after "Change server").
    func reset(prefill: String? = nil) {
        connectTask?.cancel()
        connectTask = nil
        isConnecting = false
        discovery.reset()
        manualError = nil
        manualNotice = nil
        manualNeedsLocalNetwork = false
        if let prefill { manualAddress = prefill }
        step = .welcome
    }

    func searchNetwork() {
        connectTask?.cancel()
        isConnecting = false
        manualError = nil
        manualNotice = nil
        step = .searching
        discovery.start()
    }

    func stopSearch() {
        discovery.stop()
    }

    func enterManually(notice: String? = nil) {
        discovery.stop()
        manualNotice = notice
        manualError = nil
        manualNeedsLocalNetwork = false
        step = .manual
    }

    func select(_ server: ServerDiscovery.FoundServer) {
        guard case let .current(info) = server.kind else { return }
        discovery.stop()
        onSelect?(server.address, info)
    }

    /// Validates the typed address by probing it, with a specific message for
    /// each way it can fail.
    func connectManually() {
        guard !isConnecting else { return }
        manualError = nil
        manualNeedsLocalNetwork = false

        let address: ServerAddress
        do {
            address = try ServerAddress.parse(manualAddress)
        } catch {
            manualError = error.localizedDescription
            return
        }

        isConnecting = true
        connectTask = Task {
            let outcome = await ServerProbe.probe(address)
            guard !Task.isCancelled else { return }
            isConnecting = false
            if case let .marquee(info) = outcome {
                onSelect?(address, info)
            } else {
                manualNotice = nil
                manualError = outcome.problemMessage(for: address)
                manualNeedsLocalNetwork = outcome == .unreachable(.localNetworkDenied)
            }
        }
    }

    /// Moves between steps as discovery progresses (internal for tests).
    func discoveryChanged(_ state: ServerDiscovery.State) {
        switch state {
        case .localNetworkDenied:
            if step == .searching { step = .localNetworkDenied }
        case .checkingAccess, .scanning:
            // Access was turned on while the denied card was up.
            if step == .localNetworkDenied { step = .searching }
        case .finished:
            if step == .searching, discovery.found.isEmpty, !discovery.wasStopped {
                enterManually(notice: Self.nothingFoundMessage)
            }
        case .idle:
            break
        }
    }

    /// System Settings › Privacy & Security › Local Network.
    static func openLocalNetworkSettings() {
        let candidates = [
            "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_LocalNetwork",
            "x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork",
        ]
        for candidate in candidates {
            if let url = URL(string: candidate), NSWorkspace.shared.open(url) {
                return
            }
        }
    }
}
