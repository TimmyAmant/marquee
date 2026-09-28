import Testing
import Foundation
@testable import Marquee

/// The Keychain token store and the wording the iPhone app uses where the
/// Mac's names macOS, System Settings or the Mac app.
struct PhonePlatformTests {
    @Test func keychainTokensRoundTripPerServer() {
        let store = KeychainTokenStore(service: "com.timmyamant.Marquee.tests.\(UUID().uuidString)")
        let server = "http://tower.local:3000"
        defer {
            store.delete(for: server)
            store.delete(for: "http://other:3000")
        }
        #expect(store.lookup(for: server) == .missing)

        #expect(store.save("first", for: server))
        #expect(store.token(for: server) == "first")
        #expect(store.save("second", for: server), "Saving again replaces the token")
        #expect(store.lookup(for: server) == .found("second"))
        #expect(store.token(for: "http://other:3000") == nil)

        store.delete(for: server)
        #expect(store.lookup(for: server) == .missing)
    }

    @Test func theSessionUsesTheKeychainOnIOS() {
        #expect(ServerSession.defaultTokenStore() is KeychainTokenStore)
    }

    @Test func messagesNameTheIPhone() {
        let messages = [
            PlatformText.connectIntro,
            PlatformText.localNetworkWillAsk,
            PlatformText.localNetworkIfAsked,
            PlatformText.localNetworkDenied,
            PlatformText.localNetworkNeeded,
            PlatformText.localNetworkSettingsStep,
            PlatformText.localNetworkBlocked,
            PlatformText.updateThisApp,
            PlatformText.updateThisAppAndRetry,
            PlatformText.updateOldServer,
            PlatformText.foundOnlyOldServers,
            PlatformText.savedSignInUnreadable,
            PlatformText.tmdbUnreachable,
            PlatformText.serverTooOld("tower"),
            PlatformText.serverTooNew("tower", version: "9.0.0"),
        ]
        for message in messages {
            #expect(!message.contains("Mac"), "\(message)")
            #expect(!message.contains("System Settings"), "\(message)")
            #expect(!message.contains("⌘"), "\(message)")
            #expect(!message.lowercased().contains("click"), "\(message)")
        }
        #expect(PlatformText.openSystemSettings == "Open Settings")
    }

    /// "this iPad" on an iPad (the notification prompt said iPhone there).
    @MainActor
    @Test func messagesNameThisDevice() {
        let device = PlatformText.isPad ? "iPad" : "iPhone"
        let messages = [
            PlatformText.showNotificationsHere,
            PlatformText.getNotificationsHere,
            PlatformText.signsOutHere,
            PlatformText.newPasswordSignsOut,
            PlatformText.ranHere("now"),
        ]
        for message in messages {
            #expect(message.contains(device), "\(message)")
            #expect(!message.contains("Mac"), "\(message)")
        }
        #expect(!PlatformText.notificationsOffInSystem.contains("System Settings"))
    }

    @MainActor
    @Test func theDeviceListNamesTheModel() {
        #expect(DeviceModels.names["iPhone18,1"] == "iPhone 17 Pro")
        #expect(DeviceModels.names["iPhone11,8"] == "iPhone XR")
        #expect(Platform.deviceName(model: "iPhone 17 Pro") == "iPhone 17 Pro (Marquee)")
        #expect(Platform.deviceName.hasSuffix(" (Marquee)"))
        #expect(Platform.deviceName.hasPrefix("iP"))
    }

    @Test func requestsIdentifyTheIOSApp() {
        #expect(AppInfo.userAgent.hasPrefix("Marquee-iOS/"))
    }
}
