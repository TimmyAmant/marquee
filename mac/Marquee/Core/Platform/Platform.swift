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

    /// Posted as the app quits (to stop a sign-in poll that's under way).
    @MainActor
    static var willTerminateNotification: Notification.Name {
        #if os(macOS)
        NSApplication.willTerminateNotification
        #else
        UIApplication.willTerminateNotification
        #endif
    }

    /// This device's name for the server's device list.
    @MainActor
    static var deviceName: String {
        #if os(macOS)
        return Host.current().localizedName ?? "Mac"
        #else
        // iOS 16+ gives apps only "iPhone" for the device's own name, so the
        // model says which one it is: "iPhone 17 Pro (Marquee)".
        let model = DeviceModels.currentIdentifier.flatMap { DeviceModels.names[$0] } ?? UIDevice.current.model
        return deviceName(model: model)
        #endif
    }

    /// "iPhone 17 Pro (Marquee)": the server's device list shows the Marquee
    /// app beside the browsers signed in on the same phone.
    static func deviceName(model: String) -> String {
        "\(model) (Marquee)" // i18n-ignore (a device name, not UI text)
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

    /// `choicePickerStyle()`'s radio buttons side by side on the Mac; the
    /// iOS menu has no layout to choose.
    func horizontalChoiceLayout() -> some View {
        #if os(macOS)
        horizontalRadioGroupLayout()
        #else
        self
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

    /// For a page that opens with its own serif heading ("Requests",
    /// "Library"…). On iOS the navigation bar carries the title instead —
    /// large, beside the bell, on a tab's first page; small, beside Back, on
    /// a pushed one (the tab stacks choose which) — and the page leaves its
    /// own heading out (`macPageHeading()`), so it starts right under the
    /// bar. Nothing changes on the Mac.
    func headingIsThePageTitle() -> some View {
        self
    }

    /// A page's own serif heading: shown on the Mac, left out on iOS, where
    /// the navigation bar shows the title (`headingIsThePageTitle()`).
    @ViewBuilder
    func macPageHeading() -> some View {
        #if os(macOS)
        self
        #else
        EmptyView()
        #endif
    }

    /// A sheet's fixed width on the Mac. On iOS a sheet is the screen's
    /// width already, so its content fills it from the top instead of
    /// running off both edges.
    func sheetWidth(_ width: CGFloat, alignment: Alignment = .top) -> some View {
        #if os(macOS)
        frame(width: width)
        #else
        frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
            .presentationDragIndicator(.visible)
        #endif
    }

    /// A sheet's content, scrolling on iOS, where it may be taller than the
    /// screen; the Mac's sheet is as tall as its content.
    @ViewBuilder
    func scrollsOnPhone() -> some View {
        #if os(macOS)
        self
        #else
        ScrollView { self.frame(maxWidth: .infinity, alignment: .leading) }
        #endif
    }

    /// A sheet's fixed size on the Mac; on iOS, the screen's, like
    /// `sheetWidth(_:)`.
    func sheetSize(width: CGFloat, height: CGFloat) -> some View {
        #if os(macOS)
        frame(width: width, height: height)
        #else
        sheetWidth(width)
        #endif
    }

    /// A text link:`.link` on the Mac, the tinted plain button on iOS.
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
