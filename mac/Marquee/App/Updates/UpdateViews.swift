import AppKit
import SwiftUI

/// Where an update shows: the navigation menu's footer (only while there's
/// one to offer) and Settings › About (always, with "Check for Updates").
struct UpdateStatusView: View {
    enum Style {
        case menu
        case settings
    }

    let style: Style

    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL

    /// The menu has room for an update's state, and nothing when there's none.
    static func showsInMenu(_ updater: Updater) -> Bool {
        switch updater.phase {
        case .available, .downloading, .verifying, .relaunching, .failed: return updater.update != nil
        case .idle, .checking, .upToDate: return false
        }
    }

    var body: some View {
        let updater = model.updater
        VStack(alignment: .leading, spacing: 8) {
            switch updater.phase {
            case .idle, .checking, .upToDate:
                checkRow(updater)
            case .available:
                if let update = updater.update { available(update) }
            case let .downloading(fraction):
                progress("Downloading Marquee \(updater.update?.version.description ?? "")…", fraction: fraction)
            case .verifying:
                progress("Checking the download…", fraction: nil)
            case .relaunching:
                Label("Marquee will quit and reopen", systemImage: "arrow.clockwise")
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(Theme.textPrimary)
            case let .failed(failure):
                failed(failure, update: updater.update)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(.easeOut(duration: 0.15), value: updater.phase)
    }

    // MARK: States

    @ViewBuilder
    private func checkRow(_ updater: Updater) -> some View {
        HStack(spacing: 10) {
            Group {
                switch updater.phase {
                case .checking:
                    Text("Checking for updates…")
                case .upToDate:
                    Text("You're up to date.")
                default:
                    if let error = updater.checkError {
                        Text(error.localizedDescription).foregroundStyle(Theme.danger)
                    } else {
                        Text("Marquee checks for updates once a day.")
                    }
                }
            }
            .font(.system(size: 12.5))
            .foregroundStyle(Theme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            if updater.phase == .checking {
                ProgressView().controlSize(.small)
            } else {
                Button("Check for Updates") {
                    Task { await updater.check() }
                }
                .buttonStyle(OutlineButtonStyle(compact: true))
            }
        }
    }

    private func available(_ update: AvailableUpdate) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Marquee \(update.version.description) is available")
                .font(.system(size: style == .menu ? 13 : 13.5, weight: .semibold))
                .foregroundStyle(Theme.textPrimary)
            HStack(spacing: 12) {
                Button("Update") { model.updater.install() }
                    .buttonStyle(AccentButtonStyle(compact: true))
                    .help("Download Marquee \(update.version.description), then quit and reopen")
                Button("What's new") { openURL(update.releasePage) }
                    .buttonStyle(QuietButtonStyle())
                    .font(.system(size: 12))
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func progress(_ label: String, fraction: Double?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 12.5, weight: .medium))
                .foregroundStyle(Theme.textPrimary)
            if let fraction {
                ProgressView(value: fraction)
                    .progressViewStyle(.linear)
                    .tint(Theme.accent)
                    .accessibilityValue("\(Int(fraction * 100)) percent")
            } else {
                ProgressView()
                    .progressViewStyle(.linear)
                    .tint(Theme.accent)
            }
        }
    }

    private func failed(_ failure: Updater.Failure, update: AvailableUpdate?) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(failure.error.localizedDescription)
                .font(.system(size: 12))
                .foregroundStyle(Theme.danger)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 12) {
                if let app = failure.downloadedApp {
                    Button("Show in Finder") {
                        NSWorkspace.shared.activateFileViewerSelecting([app])
                    }
                    .buttonStyle(OutlineButtonStyle(compact: true))
                } else {
                    Button("Try again") { model.updater.install() }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                }
                Button("Download manually") {
                    openURL(update?.releasePage ?? UpdateAlerts.releasesPage)
                }
                .buttonStyle(QuietButtonStyle())
                .font(.system(size: 12))
            }
        }
    }
}

/// Marquee › Check for Updates…: the answer as an alert, since it can be
/// asked from anywhere (signed out included).
@MainActor
enum UpdateAlerts {
    static let releasesPage = URL(string: "https://github.com/TimmyAmant/marquee/releases/latest")!

    /// - Parameter showProgress: Brings up where the download's progress
    ///   shows (Settings › About) once "Update" is chosen.
    static func checkNow(_ updater: Updater, showProgress: @escaping () -> Void) {
        Task {
            let result = await updater.check()
            NSApp.activate()
            let current = updater.currentVersion?.description ?? AppInfo.version
            let alert = NSAlert()
            switch result {
            case .upToDate:
                alert.messageText = "You're up to date"
                alert.informativeText = "Marquee \(current) is the newest version."
                alert.runModal()
            case let .available(update):
                alert.messageText = "Marquee \(update.version.description) is available"
                alert.informativeText = "You have \(current). Marquee downloads the update, checks it, and quits and reopens to finish."
                alert.addButton(withTitle: "Update")
                alert.addButton(withTitle: "What's New")
                alert.addButton(withTitle: "Later")
                switch alert.runModal() {
                case .alertFirstButtonReturn:
                    showProgress()
                    updater.install()
                    await reportFailure(of: updater)
                case .alertSecondButtonReturn:
                    NSWorkspace.shared.open(update.releasePage)
                default:
                    break
                }
            case let .failed(error):
                alert.alertStyle = .warning
                alert.messageText = "Couldn't check for updates"
                alert.informativeText = error.localizedDescription
                alert.addButton(withTitle: "OK")
                alert.addButton(withTitle: "Download Manually")
                if alert.runModal() == .alertSecondButtonReturn {
                    NSWorkspace.shared.open(releasesPage)
                }
            }
        }
    }

    /// An install started from the alert: its failure as an alert too, in
    /// case Settings isn't showing it (signed out, or the window was closed).
    private static func reportFailure(of updater: Updater) async {
        // `install()` has set `.downloading` by the time it returns.
        while updater.isInstalling {
            try? await Task.sleep(for: .milliseconds(250))
        }
        guard case let .failed(failure) = updater.phase else { return }
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "Marquee couldn't update"
        alert.informativeText = failure.error.localizedDescription
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: failure.downloadedApp == nil ? "Download Manually" : "Show in Finder")
        guard alert.runModal() == .alertSecondButtonReturn else { return }
        if let app = failure.downloadedApp {
            NSWorkspace.shared.activateFileViewerSelecting([app])
        } else {
            NSWorkspace.shared.open(updater.update?.releasePage ?? releasesPage)
        }
    }
}
