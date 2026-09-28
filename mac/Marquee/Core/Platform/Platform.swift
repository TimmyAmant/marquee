import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

// The few AppKit/UIKit types and calls the shared code needs, so the same
// sources build the Mac app and the iPhone app (MarqueeiOS). Anything more
// platform-specific than this stays behind `#if os(macOS)` where it's used.

#if os(macOS)
typealias PlatformImage = NSImage
typealias PlatformColor = NSColor
#else
typealias PlatformImage = UIImage
typealias PlatformColor = UIColor
#endif

extension Image {
    init(platformImage: PlatformImage) {
        #if os(macOS)
        self.init(nsImage: platformImage)
        #else
        self.init(uiImage: platformImage)
        #endif
    }
}

extension PlatformColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        #if os(macOS)
        self.init(
            srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: alpha
        )
        #else
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: alpha
        )
        #endif
    }
}

enum Platform {
    /// The general pasteboard, as plain text (and as a URL when it is one).
    @MainActor
    static func copy(_ text: String, asURL: Bool = false) {
        #if os(macOS)
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        if asURL { pasteboard.setString(text, forType: .URL) }
        pasteboard.setString(text, forType: .string)
        #else
        if asURL, let url = URL(string: text) {
            UIPasteboard.general.url = url
        } else {
            UIPasteboard.general.string = text
        }
        #endif
    }

    /// Opens `url` with the system (a browser, System Settings, another
    /// app); false when nothing could.
    @MainActor
    @discardableResult
    static func open(_ url: URL) -> Bool {
        #if os(macOS)
        return NSWorkspace.shared.open(url)
        #else
        guard UIApplication.shared.canOpenURL(url) || url.scheme == "https" || url.scheme == "http" else { return false }
        UIApplication.shared.open(url)
        return true
        #endif
    }

    /// Whether an installed app handles `url` (a `plex://` link, say).
    @MainActor
    static func hasApp(toOpen url: URL) -> Bool {
        #if os(macOS)
        return NSWorkspace.shared.urlForApplication(toOpen: url) != nil
        #else
        // Only schemes listed in LSApplicationQueriesSchemes can be checked;
        // an unlisted one answers false and the web link is used instead.
        return UIApplication.shared.canOpenURL(url)
        #endif
    }

    /// This device's name for the server's device list.
    @MainActor
    static var deviceName: String {
        #if os(macOS)
        return Host.current().localizedName ?? "Mac"
        #else
        // iOS 16+ reports only the model ("iPhone") without an entitlement.
        return UIDevice.current.name
        #endif
    }
}

#if os(macOS)
typealias PlatformTextContentType = NSTextContentType
#else
typealias PlatformTextContentType = UITextContentType
#endif

extension View {
    /// A few exclusive choices: radio buttons on the Mac, a menu on iOS
    /// (which has no radio group).
    func choicePickerStyle() -> some View {
        #if os(macOS)
        pickerStyle(.radioGroup)
        #else
        pickerStyle(.menu)
        #endif
    }

    /// A checkbox on the Mac, a switch on iOS.
    func checkboxToggleStyle() -> some View {
        #if os(macOS)
        toggleStyle(.checkbox)
        #else
        toggleStyle(.switch)
        #endif
    }

    /// A text link: `.link` on the Mac, the tinted plain button on iOS.
    func linkButtonStyle() -> some View {
        #if os(macOS)
        buttonStyle(.link)
        #else
        buttonStyle(.plain).foregroundStyle(Theme.accent)
        #endif
    }

    /// Escape on the Mac; nothing on iOS (sheets close by swiping or Done).
    func onExitCommandIfAvailable(perform action: @escaping () -> Void) -> some View {
        #if os(macOS)
        onExitCommand(perform: action)
        #else
        self
        #endif
    }
}
