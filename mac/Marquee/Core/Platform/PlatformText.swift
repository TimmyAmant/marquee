import Foundation
#if os(iOS)
import UIKit
#endif

/// Shared messages that name the device or its settings: "the Mac app" and
/// System Settings on the Mac, "the iPhone app" and the Settings app on iOS.
/// Each keeps its own catalog entry, so every language says it naturally.
enum PlatformText {
    #if os(iOS)
    /// Whether this is an iPad, for the messages that say "this iPad"
    /// rather than "this iPhone".
    @MainActor
    static var isPad: Bool { UIDevice.current.userInterfaceIdiom == .pad }
    #endif

    /// Settings › Notifications' switch for this device's banners.
    @MainActor
    static var showNotificationsHere: String {
        #if os(macOS)
        String(localized: "Show notifications on this Mac")
        #else
        isPad ? String(localized: "Show notifications on this iPad") : String(localized: "Show notifications on this iPhone")
        #endif
    }

    /// The card that asks, the first time you sign in on this device.
    @MainActor
    static var getNotificationsHere: String {
        #if os(macOS)
        String(localized: "Get notifications on this Mac?")
        #else
        isPad ? String(localized: "Get notifications on this iPad?") : String(localized: "Get notifications on this iPhone?")
        #endif
    }

    /// Settings › Account › Sign out's help.
    @MainActor
    static var signsOutHere: String {
        #if os(macOS)
        String(localized: "Signs you out of Marquee on this Mac.")
        #else
        isPad ? String(localized: "Signs you out of Marquee on this iPad.") : String(localized: "Signs you out of Marquee on this iPhone.")
        #endif
    }

    /// Changing your own password, in the member editor.
    @MainActor
    static var newPasswordSignsOut: String {
        #if os(macOS)
        String(localized: "Setting a new password signs you out of every device, including this Mac.")
        #else
        isPad
            ? String(localized: "Setting a new password signs you out of every device, including this iPad.")
            : String(localized: "Setting a new password signs you out of every device, including this iPhone.")
        #endif
    }

    /// Settings › Jobs, under a job run from this device.
    @MainActor
    static func ranHere(_ timeAgo: String) -> String {
        #if os(macOS)
        String(localized: "Ran from this Mac \(timeAgo)")
        #else
        isPad ? String(localized: "Ran from this iPad \(timeAgo)") : String(localized: "Ran from this iPhone \(timeAgo)")
        #endif
    }

    /// Banners for Marquee are off in the system's settings.
    static var notificationsOffInSystem: String {
        #if os(macOS)
        String(localized: "Notifications for Marquee are turned off in System Settings.")
        #else
        String(localized: "Notifications for Marquee are off in the Settings app.")
        #endif
    }

    static func serverTooOld(_ name: String) -> String {
        #if os(macOS)
        String(localized: "Found Marquee at \(name), but the server needs updating to \(ServerInfo.minimumServerVersion) or later to work with the Mac app.")
        #else
        String(localized: "Found Marquee at \(name), but the server needs updating to \(ServerInfo.minimumServerVersion) or later to work with the iPhone app.")
        #endif
    }

    static func serverTooNew(_ name: String, version: String) -> String {
        #if os(macOS)
        String(localized: "The server at \(name) runs Marquee \(version), which is newer than this app supports. Update Marquee for Mac.")
        #else
        String(localized: "The server at \(name) runs Marquee \(version), which is newer than this app supports. Update Marquee for iPhone.")
        #endif
    }

    static var localNetworkDenied: String {
        #if os(macOS)
        String(localized: "Marquee doesn't have Local Network access. Turn it on in System Settings › Privacy & Security › Local Network.")
        #else
        String(localized: "Marquee doesn't have Local Network access. Turn it on in Settings › Privacy & Security › Local Network.")
        #endif
    }

    static var savedSignInUnreadable: String {
        #if os(macOS)
        String(localized: "Couldn't read your saved sign-in. Sign in again, or reload (⌘R) to retry.")
        #else
        String(localized: "Couldn't read your saved sign-in. Sign in again.")
        #endif
    }

    static var tmdbUnreachable: String {
        #if os(macOS)
        String(localized: "Your server couldn't get anything back from TMDb. Check its internet connection or the TMDb credential in Settings → General, then reload (⌘R).")
        #else
        String(localized: "Your server couldn't get anything back from TMDb. Check its internet connection or the TMDb credential in Settings → General, then try again.")
        #endif
    }

    static var connectIntro: String {
        #if os(macOS)
        String(localized: "Marquee for Mac connects to the Marquee server running on your home network, like the one on your Unraid box.")
        #else
        String(localized: "Marquee for iPhone connects to the Marquee server running on your home network, like the one on your Unraid box.")
        #endif
    }

    static var localNetworkWillAsk: String {
        #if os(macOS)
        String(localized: "macOS will ask for permission first. Click Allow so Marquee can reach your server.")
        #else
        String(localized: "iOS will ask for permission first. Tap Allow so Marquee can reach your server.")
        #endif
    }

    static var localNetworkIfAsked: String {
        #if os(macOS)
        String(localized: "If macOS asks to find devices on your local network, click Allow.")
        #else
        String(localized: "If iOS asks to find devices on your local network, tap Allow.")
        #endif
    }

    static var foundOnlyOldServers: String {
        #if os(macOS)
        String(localized: "Marquee is running on your network, but the Mac app needs server version \(ServerInfo.minimumServerVersion) or later.")
        #else
        String(localized: "Marquee is running on your network, but the iPhone app needs server version \(ServerInfo.minimumServerVersion) or later.")
        #endif
    }

    static var updateOldServer: String {
        #if os(macOS)
        String(localized: "Update this server to Marquee \(ServerInfo.minimumServerVersion) or later to use it with the Mac app.")
        #else
        String(localized: "Update this server to Marquee \(ServerInfo.minimumServerVersion) or later to use it with the iPhone app.")
        #endif
    }

    static var updateThisApp: String {
        #if os(macOS)
        String(localized: "This server is newer than this app supports. Update Marquee for Mac to connect.")
        #else
        String(localized: "This server is newer than this app supports. Update Marquee for iPhone to connect.")
        #endif
    }

    static var updateThisAppAndRetry: String {
        #if os(macOS)
        String(localized: "Your Marquee server is newer than this app. Update Marquee for Mac, then try again.")
        #else
        String(localized: "Your Marquee server is newer than this app. Update Marquee for iPhone, then try again.")
        #endif
    }

    static var localNetworkNeeded: String {
        #if os(macOS)
        String(localized: "Marquee needs permission to look for your server on your home network. If macOS just asked, click Allow and the search continues on its own.")
        #else
        String(localized: "Marquee needs permission to look for your server on your home network. If iOS just asked, tap Allow and the search continues on its own.")
        #endif
    }

    static var localNetworkSettingsStep: String {
        #if os(macOS)
        String(localized: "Open System Settings › Privacy & Security › Local Network.")
        #else
        String(localized: "Open Settings › Privacy & Security › Local Network.")
        #endif
    }

    static var localNetworkBlocked: String {
        #if os(macOS)
        String(localized: "macOS is blocking Marquee from your home network. Turn it on in System Settings, then try again.")
        #else
        String(localized: "iOS is blocking Marquee from your home network. Turn it on in Settings, then try again.")
        #endif
    }

    /// The button that opens the system's settings.
    static var openSystemSettings: String {
        #if os(macOS)
        String(localized: "Open System Settings")
        #else
        String(localized: "Open Settings")
        #endif
    }
}
