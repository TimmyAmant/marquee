import SwiftUI
import UserNotifications

@main
struct MarqueeApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var model: AppModel
    @AppStorage(AppearancePreference.storageKey) private var appearance = AppearancePreference.system.rawValue

    init() {
        // Before anything reads a setting. Not for the unit tests' host, nor a
        // pinned (automated) run, which leave this Mac's real settings alone.
        if !AppInfo.isRunningTests, PinnedServer.resolve() == nil {
            SandboxMigration.run()
        }
        let model = AppModel()
        _model = State(initialValue: model)
        AppDelegate.model = model
    }

    var body: some Scene {
        WindowGroup("Marquee", id: "main") {
            RootView()
                .environment(model)
                .frame(minWidth: 960, minHeight: 640)
                .onAppear {
                    (AppearancePreference(rawValue: appearance) ?? .system).apply()
                    // As a unit-test host the app stays on its launch screen:
                    // no saved-server restore, Keychain read or badge polling.
                    if !AppInfo.isRunningTests {
                        model.bootstrap()
                    }
                }
                .onChange(of: appearance) { _, newValue in
                    (AppearancePreference(rawValue: newValue) ?? .system).apply()
                }
                .onOpenURL { url in
                    model.handle(url: url)
                }
        }
        .defaultSize(width: 1320, height: 860)
        .windowToolbarStyle(.unified(showsTitle: false))
        .commands {
            MarqueeCommands(model: model)
        }

        Window("Error Reference", id: "error-reference") {
            ErrorReferenceView()
                .environment(model)
                .frame(minWidth: 520, minHeight: 480)
        }
        .defaultSize(width: 720, height: 760)

        Window("Marquee Releases", id: "changelog") {
            ChangelogView()
                .environment(model)
                .frame(minWidth: 520, minHeight: 420)
        }
        .defaultSize(width: 640, height: 620)
    }
}

/// Handles notification-banner clicks and app lifecycle hooks SwiftUI's
/// scene API doesn't expose.
final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    @MainActor static var model: AppModel?

    func applicationDidFinishLaunching(_ notification: Notification) {
        UNUserNotificationCenter.current().delegate = self
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        MainActor.assumeIsolated {
            Self.model?.applicationDidBecomeActive()
        }
    }

    // Show banners even while Marquee is frontmost.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let route = response.notification.request.content.userInfo["route"] as? String
        guard let route, let url = URL(string: route) else { return }
        await MainActor.run {
            Self.model?.showMainWindow()
            Self.model?.handle(url: url)
        }
    }
}
