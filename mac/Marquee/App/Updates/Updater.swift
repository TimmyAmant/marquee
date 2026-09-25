import AppKit
import Observation
import OSLog

/// Keeps this Mac on the newest Marquee: checks GitHub's latest release ten
/// seconds after launch and then daily (and from Marquee › Check for
/// Updates…), and on "Update" downloads it, checks it, and swaps it in, then
/// quits so the new version opens in its place (`UpdateService`,
/// `UpdateInstaller`).
@MainActor
@Observable
final class Updater {
    enum Phase: Equatable {
        case idle
        case checking
        case upToDate
        /// `update` is newer than this app.
        case available
        /// 0...1 of the zip.
        case downloading(Double)
        /// Unpacking and checking the app.
        case verifying
        /// The swap is running; Marquee is about to quit.
        case relaunching
        case failed(Failure)
    }

    struct Failure: Equatable {
        let error: UpdateError
        /// The checked new app, kept in Downloads when it couldn't be put in
        /// place (for "Show in Finder").
        var downloadedApp: URL?
    }

    enum CheckResult: Equatable {
        case upToDate(latest: AppVersion?)
        case available(AvailableUpdate)
        case failed(UpdateError)
    }

    static let firstCheckDelay: Duration = .seconds(10)
    static let checkInterval: Duration = .seconds(24 * 60 * 60)
    /// The version whose "is available" banner has been shown.
    static let announcedKey = "marquee.update.announcedVersion"

    private(set) var phase: Phase = .idle
    /// The newest release, when it's newer than this app.
    private(set) var update: AvailableUpdate?
    /// Why the last check didn't get an answer (shown in Settings › About).
    private(set) var checkError: UpdateError?

    let currentVersion: AppVersion?

    /// A newer release was found by a check: once per version, the main
    /// window's banner says so.
    @ObservationIgnored var onNewUpdate: ((AvailableUpdate) -> Void)?

    @ObservationIgnored private let service: UpdateService
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var scheduleTask: Task<Void, Never>?
    @ObservationIgnored private var installTask: Task<Void, Never>?

    private static let logger = Logger(subsystem: "com.timmyamant.Marquee", category: "updates")

    init(
        service: UpdateService = UpdateService(),
        currentVersion: AppVersion? = .current,
        defaults: UserDefaults = .standard
    ) {
        self.service = service
        self.currentVersion = currentVersion
        self.defaults = defaults
    }

    var isInstalling: Bool {
        switch phase {
        case .downloading, .verifying, .relaunching: return true
        default: return false
        }
    }

    // MARK: Checking

    func startAutomaticChecks() {
        guard scheduleTask == nil else { return }
        scheduleTask = Task { [weak self] in
            try? await Task.sleep(for: Updater.firstCheckDelay)
            while !Task.isCancelled {
                await self?.check()
                try? await Task.sleep(for: Updater.checkInterval)
            }
        }
    }

    /// Asks GitHub for the latest release. A failure leaves an update that
    /// was already found in place.
    @discardableResult
    func check() async -> CheckResult {
        guard !isInstalling else { return update.map(CheckResult.available) ?? .upToDate(latest: currentVersion) }
        let previous = phase
        if update == nil { phase = .checking }

        let result: CheckResult
        do {
            let release = try await service.latestRelease()
            guard let latest = AppVersion(release.tagName) else { throw UpdateError.unreadableRelease }
            if let currentVersion, latest <= currentVersion {
                result = .upToDate(latest: latest)
            } else if let available = AvailableUpdate(release: release) {
                result = .available(available)
            } else {
                // Newer, but CI hasn't attached the Mac download yet.
                throw UpdateError.noDownload
            }
        } catch {
            result = .failed(error as? UpdateError ?? .unreachable)
        }

        guard !isInstalling else { return result }
        switch result {
        case let .upToDate(latest):
            Self.logger.info("Up to date (latest release \(latest?.description ?? "?", privacy: .public))")
            checkError = nil
            update = nil
            phase = .upToDate
        case let .available(available):
            Self.logger.info("Marquee \(available.version.description, privacy: .public) is available")
            checkError = nil
            update = available
            phase = .available
            announceOnce(available)
        case let .failed(error):
            Self.logger.info("Update check failed: \(error.localizedDescription, privacy: .public)")
            checkError = error
            phase = update == nil ? (previous == .checking ? .idle : previous) : .available
        }
        return result
    }

    private func announceOnce(_ available: AvailableUpdate) {
        guard defaults.string(forKey: Self.announcedKey) != available.version.description else { return }
        defaults.set(available.version.description, forKey: Self.announcedKey)
        onNewUpdate?(available)
    }

    // MARK: Installing

    /// "Update": download, check, swap, relaunch. Progress and any failure
    /// show in `phase`.
    func install() {
        guard let update, !isInstalling else { return }
        phase = .downloading(0)
        installTask = Task { [weak self] in
            await self?.install(update)
        }
    }

    private func install(_ update: AvailableUpdate) async {
        let bundle = Bundle.main.bundleURL
        let blocker = UpdateInstaller.blocker(for: bundle)
        do {
            let workspace = try UpdateInstaller.workspace(near: blocker == nil ? bundle : nil)
            let sha256 = try await service.expectedSHA256(for: update)
            let zip = try await service.download(update, sha256: sha256, into: workspace) { [weak self] fraction in
                Task { @MainActor in self?.downloaded(fraction) }
            }
            phase = .verifying
            let app = try await UpdateInstaller.unpack(zip, in: workspace, expecting: update.version)

            if let blocker {
                // Checked and ready, but it can't go where this copy is.
                let kept = UpdateInstaller.keepForManualInstall(app, version: update.version)
                phase = .failed(Failure(error: blocker, downloadedApp: kept))
                return
            }

            phase = .relaunching
            // Long enough to read "Marquee will quit and reopen".
            try? await Task.sleep(for: .seconds(1.5))
            try UpdateInstaller.launchSwap(current: bundle, new: app, pid: ProcessInfo.processInfo.processIdentifier, workspace: workspace)
            Self.logger.notice("Installing Marquee \(update.version.description, privacy: .public); quitting so it can open")
            NSApp.terminate(nil)
        } catch {
            let failure = error as? UpdateError ?? .downloadFailed
            Self.logger.error("Update failed: \(failure.localizedDescription, privacy: .public)")
            phase = .failed(Failure(error: failure))
        }
    }

    private func downloaded(_ fraction: Double) {
        guard case let .downloading(shown) = phase, fraction - shown >= 0.01 || fraction >= 1 else { return }
        phase = .downloading(fraction)
    }
}
