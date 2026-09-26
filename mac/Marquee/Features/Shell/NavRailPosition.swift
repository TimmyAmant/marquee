import SwiftUI

/// Settings › Account › "Menu position": which edge of the window the
/// navigation rail floats on. Left is the design's own (Docs/DESIGN_TARGET.md
/// › Navigation); Right mirrors it, and Top and Bottom lay the same items out
/// in a row. Kept per Mac, in UserDefaults.
enum NavRailPosition: String, CaseIterable, Identifiable {
    case left
    case right
    case top
    case bottom

    static let storageKey = "marquee-nav-position"
    /// The space between a top or bottom bar and the page.
    static let bandGap: CGFloat = 12

    /// What's stored, or Left for nothing or a value this build doesn't know.
    init(stored: String?) {
        self = stored.flatMap(Self.init(rawValue:)) ?? .left
    }

    var id: String { rawValue }

    var label: String {
        switch self {
        case .left: return "Left"
        case .right: return "Right"
        case .top: return "Top"
        case .bottom: return "Bottom"
        }
    }

    /// A column on the left or right; a row at the top or bottom.
    var isVertical: Bool {
        self == .left || self == .right
    }

    /// The window edge the rail sits against.
    var edge: Edge {
        switch self {
        case .left: return .leading
        case .right: return .trailing
        case .top: return .top
        case .bottom: return .bottom
        }
    }

    /// The side of the rail the page is on: where hover names and the
    /// notifications popover open.
    var towardContent: Edge {
        switch edge {
        case .leading: return .trailing
        case .trailing: return .leading
        case .top: return .bottom
        case .bottom: return .top
        }
    }

    /// Where the rail sits in the window: centered along its edge.
    var alignment: Alignment {
        switch self {
        case .left: return .leading
        case .right: return .trailing
        case .top: return .top
        case .bottom: return .bottom
        }
    }

    /// How far pages keep clear of the rail: `Metrics.contentLeading` (its
    /// 16 inset plus its 56 thickness) on the rail's edge, nothing elsewhere.
    /// A bar along the top or bottom gets its own band with the same 16 on
    /// the page's side too, so it has room to breathe above the artwork.
    var contentInsets: EdgeInsets {
        let reach = Metrics.contentLeading
        let band = reach + Self.bandGap
        switch self {
        case .left: return EdgeInsets(top: 0, leading: reach, bottom: 0, trailing: 0)
        case .right: return EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: reach)
        case .top: return EdgeInsets(top: band, leading: 0, bottom: 0, trailing: 0)
        case .bottom: return EdgeInsets(top: 0, leading: 0, bottom: band, trailing: 0)
        }
    }
}

extension EnvironmentValues {
    /// The main window's rail position, for the rail's own pieces.
    @Entry var navRailPosition: NavRailPosition = .left
}
