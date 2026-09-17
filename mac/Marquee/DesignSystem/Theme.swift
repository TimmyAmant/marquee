import SwiftUI
import AppKit

/// Marquee's color tokens from app/globals.css, resolved per window
/// appearance so light/dark (and the in-app Appearance override) just work.
enum Theme {
    static let bg0 = dynamic(light: 0xFAF8F4, dark: 0x0A0A0C)
    static let bg1 = dynamic(light: 0xFFFFFF, dark: 0x131217)
    static let bg2 = dynamic(light: 0xF1EEE6, dark: 0x1C1B22)
    static let bg3 = dynamic(light: 0xE7E2D5, dark: 0x26242E)
    static let border = dynamic(light: 0xE1DCCD, dark: 0x2C2A35)
    static let borderStrong = dynamic(light: 0xCCC4B0, dark: 0x3A3745)

    static let textPrimary = dynamic(light: 0x211F1A, dark: 0xF3F1EA)
    static let textSecondary = dynamic(light: 0x5C574C, dark: 0xA8A4B3)
    static let textMuted = dynamic(light: 0x8B8575, dark: 0x6F6C7D)

    static let accent = dynamic(light: 0xB3791F, dark: 0xE0A63E)
    static let accentHover = dynamic(light: 0x9C6818, dark: 0xF0B954)
    static let accentMuted = dynamic(light: 0xF3DFB0, dark: 0x6B5326)

    static let owned = dynamic(light: 0x2F7A52, dark: 0x4CAF7D)
    static let ownedBg = dynamic(light: 0xE3F3EA, dark: 0x14251C)
    static let tracked = dynamic(light: 0x2F6FB0, dark: 0x4F8FD1)
    static let trackedBg = dynamic(light: 0xE5F0FA, dark: 0x10202F)
    static let untrackedBg = dynamic(light: 0xEFECE3, dark: 0x201F26)

    static let danger = Color(red: 0.97, green: 0.44, blue: 0.44)

    /// Status strip colors under each poster (poster-card.tsx STATUS_BAR_CLASS).
    /// A status this app doesn't know gets no strip.
    static func statusBar(_ status: API.LibraryStatus) -> Color {
        switch status {
        case .owned: return owned
        case .trackedDownloading: return tracked
        case .trackedMonitored: return Color(red: 0.94, green: 0.27, blue: 0.27)
        case .comingSoon: return Color(red: 0.66, green: 0.33, blue: 0.97)
        case .untracked: return Color(red: 0.92, green: 0.70, blue: 0.03)
        case .unknown: return .clear
        }
    }

    /// The mockup's grain texture opacity over a backdrop (.grain-overlay).
    static let grainOpacity: Double = 0.05

    static func dynamic(light: UInt32, dark: UInt32) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            return NSColor(hex: isDark ? dark : light)
        })
    }

    static func hex(_ value: UInt32) -> Color {
        Color(nsColor: NSColor(hex: value))
    }
}

extension NSColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(
            srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: alpha
        )
    }
}

extension Font {
    /// Fraunces stands in as the system serif (New York) — no bundled fonts.
    static func marqueeDisplay(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }
}

enum AppearancePreference: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: return "System"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }

    static let storageKey = "marquee-theme"

    @MainActor
    func apply() {
        switch self {
        case .system: NSApp.appearance = nil
        case .light: NSApp.appearance = NSAppearance(named: .aqua)
        case .dark: NSApp.appearance = NSAppearance(named: .darkAqua)
        }
    }
}

// MARK: - Layout

/// Every number the mockup pins down (Docs/DESIGN_TARGET.md, from
/// Design/Mockups/mockup.html's CSS). The reference frame is a 1440×900
/// window: a 230pt sidebar and a 52pt top bar leave a 1210×848 content area,
/// which is what this app's window already measures.
enum Metrics {
    /// The window's unified toolbar, which the title backdrop bleeds under.
    static let topBar: CGFloat = 52

    // Shelf pages (Discover, Movies, Series, search, person, studio).
    /// `.page{padding:28px 0 28px 28px}` — 0 on the right so cards bleed off.
    static let pagePadding: CGFloat = 28
    /// `.shelf{margin-bottom:48px}`.
    static let shelfSpacing: CGFloat = 48
    /// `.shelf-head{height:28px;margin-bottom:12px}`.
    static let shelfHeadHeight: CGFloat = 28
    static let shelfHeadGap: CGFloat = 12
    /// `.row{gap:20px}` for poster cards, 16 for genre tiles and cast.
    static let posterGap: CGFloat = 20
    static let tileGap: CGFloat = 16
    /// `.card{width:156px}` / `.art{height:234px}`.
    static let posterWidth: CGFloat = 156
    static let posterHeight: CGFloat = 234

    // Title page.
    /// `.tp-poster{left:48px}` — the page's left gutter.
    static let titleGutter: CGFloat = 48
    /// 1210 − (882 + 288): the gutter left of the window edge past the rail.
    static let titleRightGutter: CGFloat = 40
    /// Poster → main column, and main column → right rail.
    static let titleColumnGap: CGFloat = 32
    /// `.backdrop{height:380px}`.
    static let backdropHeight: CGFloat = 380
    /// `.tp-poster{top:170px;width:224px;height:336px}`.
    static let titlePosterTop: CGFloat = 170
    static let titlePosterWidth: CGFloat = 224
    static let titlePosterHeight: CGFloat = 336
    /// `.tp-main{top:246px;width:546px}` — 76 below the poster's top.
    static let titleColumnTop: CGFloat = 246 - 170
    static let titleTextWidth: CGFloat = 546
    /// 48 → 850: the poster + main column, and the cast carousel under them.
    static let titleLeftWidth: CGFloat = 802
    /// `.tp-side{width:288px}`.
    static let titleRailWidth: CGFloat = 288
    /// The cast carousel sits 40 below the main column (mockup.html's own JS).
    static let titleSectionGap: CGFloat = 40

    /// `.person{width:112px}` / `.portrait{height:124px}` — cast cards.
    static let castWidth: CGFloat = 112
    static let castPortraitHeight: CGFloat = 124
}

// MARK: - Shared surface styles

struct CardSurface: ViewModifier {
    var padding: CGFloat = 20
    var radius: CGFloat = 16

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(Theme.bg1, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(Theme.border, lineWidth: 1)
            )
    }
}

extension View {
    func cardSurface(padding: CGFloat = 20, radius: CGFloat = 16) -> some View {
        modifier(CardSurface(padding: padding, radius: radius))
    }

    /// Gold radial glow behind page headers (Discover/Movies/Series).
    func marqueeGlow() -> some View {
        background(alignment: .top) {
            RadialGradient(
                colors: [Theme.accent.opacity(0.14), .clear],
                center: .init(x: 0.5, y: -0.1),
                startRadius: 0,
                endRadius: 620
            )
            .frame(height: 420)
            .allowsHitTesting(false)
        }
    }
}

/// Primary gold capsule button (bg-accent text-bg-0).
struct AccentButtonStyle: ButtonStyle {
    var compact = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            // .addbtn — height 26, 11.5/650 — on cards; the page-level
            // buttons keep their padded size.
            .font(.system(size: compact ? 11.5 : 12.5, weight: .semibold))
            .foregroundStyle(Theme.bg0)
            .padding(.horizontal, compact ? 10 : 16)
            .padding(.vertical, compact ? 0 : 7)
            .frame(height: compact ? 26 : nil)
            .background(
                Capsule().fill(configuration.isPressed ? Theme.accentHover : Theme.accent)
            )
            .shadow(color: compact ? Theme.accent.opacity(0.25) : .clear, radius: 4, y: 2)
            .opacity(isEnabled ? 1 : 0.6)
            .contentShape(Capsule())
    }
}

/// One of the mockup's fixed pill sizes (`.pill`, `.links .pill`, `.pill.lg`).
/// The left inset is smaller than the right because these pills lead with an
/// icon.
struct PillSize: Hashable, Sendable {
    var height: CGFloat
    var fontSize: CGFloat
    var leading: CGFloat
    var trailing: CGFloat
    /// The gap the label should put between its icon and its text.
    var iconGap: CGFloat

    /// `.pill` — the Favorite pill on the meta line.
    static let small = PillSize(height: 26, fontSize: 12, leading: 9, trailing: 11, iconGap: 5)
    /// `.links .pill` — Trailer / IMDb / socials.
    static let medium = PillSize(height: 30, fontSize: 12.5, leading: 11, trailing: 13, iconGap: 5)
    /// `.pill.lg` — the title page's action row.
    static let large = PillSize(height: 32, fontSize: 13, leading: 12, trailing: 14, iconGap: 6)
}

/// Outlined capsule (border-border-strong, hover accent).
struct OutlineButtonStyle: ButtonStyle {
    var tint: Color? = nil
    var compact = false
    /// A fixed pill size from the mockup; nil keeps the padding-sized pill.
    var pill: PillSize? = nil

    func makeBody(configuration: Configuration) -> some View {
        OutlineButtonBody(configuration: configuration, tint: tint, compact: compact, pill: pill)
    }
}

private struct OutlineButtonBody: View {
    let configuration: ButtonStyleConfiguration
    let tint: Color?
    let compact: Bool
    let pill: PillSize?
    @State private var hovering = false
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        let active = hovering || configuration.isPressed
        configuration.label
            .font(.system(size: pill?.fontSize ?? (compact ? 11 : 12.5), weight: .medium))
            .foregroundStyle(tint ?? (active ? Theme.accent : Theme.textPrimary))
            .padding(.leading, pill?.leading ?? (compact ? 10 : 14))
            .padding(.trailing, pill?.trailing ?? (compact ? 10 : 14))
            .padding(.vertical, pill == nil ? (compact ? 4 : 6) : 0)
            .frame(height: pill?.height)
            .background(Capsule().fill(configuration.isPressed ? Theme.bg2 : Color.clear))
            .overlay(Capsule().strokeBorder(active ? (tint ?? Theme.accent) : Theme.borderStrong, lineWidth: 1))
            .opacity(isEnabled ? 1 : 0.6)
            .contentShape(Capsule())
            .onHover { hovering = $0 }
    }
}

/// Plain text link-style button with accent hover.
struct QuietButtonStyle: ButtonStyle {
    var color: Color = Theme.textSecondary

    func makeBody(configuration: Configuration) -> some View {
        QuietButtonBody(configuration: configuration, color: color)
    }
}

private struct QuietButtonBody: View {
    let configuration: ButtonStyleConfiguration
    let color: Color
    @State private var hovering = false

    var body: some View {
        configuration.label
            .foregroundStyle(hovering ? Theme.accent : color)
            .opacity(configuration.isPressed ? 0.7 : 1)
            .contentShape(Rectangle())
            .onHover { hovering = $0 }
    }
}
