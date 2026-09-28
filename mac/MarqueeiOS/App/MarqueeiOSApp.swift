import SwiftUI
import UIKit
import UserNotifications

/// Marquee for iPhone (and iPad): the Mac app's model, API client and screens
/// in a tab-bar shell (`PhoneRootView`).
@main
struct MarqueeiOSApp: App {
    @UIApplicationDelegateAdaptor(PhoneAppDelegate.self) private var appDelegate
    @State private var model: AppModel
    @AppStorage(AppearancePreference.storageKey) private var appearance = AppearancePreference.system.rawValue
    @Environment(\.scenePhase) private var scenePhase

    init() {
        let model = AppModel()
        _model = State(initialValue: model)
        PhoneAppDelegate.model = model
        PhoneNavigationBar.applyStyle()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .preferredColorScheme((AppearancePreference(rawValue: appearance) ?? .system).colorScheme)
                .onAppear {
                    // As a unit-test host the app stays on its launch screen.
                    if !AppInfo.isRunningTests {
                        model.bootstrap()
                    }
                }
                .onOpenURL { url in
                    model.handle(url: url)
                }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                model.applicationDidBecomeActive()
            }
        }
    }
}

/// Notification banners while Marquee is open, and opening the title a
/// tapped notification is about.
final class PhoneAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    @MainActor static var model: AppModel?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

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
            Self.model?.handle(url: url)
        }
    }
}
