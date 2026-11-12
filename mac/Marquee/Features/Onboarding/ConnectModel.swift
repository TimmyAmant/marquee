import SwiftUI
import Observation
#if os(macOS)
import AppKit
#else
import UIKit
#endif

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

    static let nothingFoundMessage = String(localized: "We couldn't find a Marquee server on your network.")

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
    /// each way it can fail. A bare host name off the local network is tried
    /// over https first, then plain http (`ServerAddress.candidates(for:)`).
    func connectManually() {
        guard !isConnecting else { return }
        manualError = nil
        manualNeedsLocalNetwork = false

        let candidates: [ServerAddress]
        do {
            candidates = try ServerAddress.candidates(for: manualAddress)
        } catch {
            manualError = error.localizedDescription
            return
        }

        isConnecting = true
        connectTask = Task {
            var failure: (address: ServerAddress, outcome: ProbeOutcome)?
            for address in candidates {
                let outcome = await ServerProbe.probe(address)
                guard !Task.isCancelled else { return }
                if case let .marquee(info) = outcome {
                    isConnecting = false
                    onSelect?(address, info)
                    return
                }
                failure = (address, outcome)
                // An older or newer Marquee answered: that's the server, so
                // its own message beats trying the next scheme.
                if outcome == .legacy { break }
                if case .incompatible = outcome { break }
            }
            isConnecting = false
            guard let failure else { return }
            manualNotice = nil
            manualError = failure.outcome.problemMessage(for: failure.address)
            manualNeedsLocalNetwork = failure.outcome == .unreachable(.localNetworkDenied)
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

    /// System Settings › Privacy & Security › Local Network (on iOS, the
    /// Settings app's page for Marquee, which has the Local Network switch).
    static func openLocalNetworkSettings() {
        #if os(iOS)
        if let url = URL(string: UIApplication.openSettingsURLString) {
            Platform.open(url)
        }
        #else
        let candidates = [
            "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_LocalNetwork",
            "x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork",
        ]
        for candidate in candidates {
            if let url = URL(string: candidate), Platform.open(url) {
                return
            }
        }
        #endif
    }
}
