import SwiftUI

/// Which palette a pill or badge draws itself in.
enum BadgeTone: Hashable {
    case owned
    case tracked
    case neutral
    case accent
    case danger
}

extension API.LibraryStatus {
    /// components/status-badge.tsx's color groups.
    var tone: BadgeTone {
        switch self {
        case .owned: return .owned
        case .trackedDownloading, .trackedMonitored: return .tracked
        case .comingSoon, .untracked, .unknown: return .neutral
        }
    }
}

extension API.RequestTone {
    /// requests/page.tsx myRequestBadge's colors.
    var badgeTone: BadgeTone {
        switch self {
        case .owned: return .owned
        case .pending, .downloading, .approved: return .tracked
        case .declined, .comingSoon, .unknown: return .neutral
        }
    }
}

/// components/status-badge.tsx. A status this version of the app doesn't know
/// renders nothing rather than a raw wire value.
struct StatusBadge: View {
    let status: API.LibraryStatus
    var compact = false
    /// `.bigbadge` — the title page's library badge (height 32, 13/600).
    var large = false

    private var colors: (foreground: Color, background: Color, border: Color) {
        switch status.tone {
        case .owned: return (Theme.owned, Theme.ownedBg, Theme.owned.opacity(0.34))
        case .tracked: return (Theme.tracked, Theme.trackedBg, Theme.tracked.opacity(0.34))
        case .neutral, .accent, .danger: return (Theme.textSecondary, Theme.untrackedBg, Theme.border)
        }
    }

    var body: some View {
        if status.isKnown {
            let colors = self.colors
            HStack(spacing: dotGap) {
                Circle()
                    .fill(colors.foreground)
                    .frame(width: dotSize, height: dotSize)
                    .overlay(Circle().strokeBorder(colors.foreground.opacity(0.18), lineWidth: large ? 3 : 0))
                Text(compact ? status.compactLabel : status.label)
            }
            .font(.system(size: large ? 13 : (compact ? 10 : 11.5), weight: compact || large ? .semibold : .medium))
            .foregroundStyle(colors.foreground)
            .padding(.leading, large ? 12 : (compact ? 5 : 11))
            .padding(.trailing, large ? 14 : (compact ? 6 : 11))
            .padding(.vertical, large ? 0 : (compact ? 0 : 4.5))
            .frame(height: large ? 32 : (compact ? 17 : nil))
            .background(Capsule().fill(colors.background.opacity(compact ? 0.94 : 1)))
            .overlay(Capsule().strokeBorder(colors.border, lineWidth: 1))
            .shadow(color: compact ? .black.opacity(0.25) : .clear, radius: 2, y: 1)
            .fixedSize()
        }
    }

    /// `.status i{5px}` on a card, `.bigbadge i{8px}` on the title page.
    private var dotSize: CGFloat { large ? 8 : (compact ? 5 : 6) }
    private var dotGap: CGFloat { large ? 8 : (compact ? 4 : 6) }
}

/// Generic rounded pill used for request statuses, "Connected", episode file state.
struct TonePill: View {
    let text: String
    var tone: BadgeTone = .neutral
    var small = false

    var body: some View {
        let (foreground, background, border) = palette
        Text(text)
            .font(.system(size: small ? 10 : 11.5, weight: .medium))
            .foregroundStyle(foreground)
            .padding(.horizontal, small ? 7 : 10)
            .padding(.vertical, small ? 2 : 3.5)
            .background(Capsule().fill(background))
            .overlay(Capsule().strokeBorder(border, lineWidth: 1))
            .fixedSize()
    }

    private var palette: (Color, Color, Color) {
        switch tone {
        case .owned: return (Theme.owned, Theme.ownedBg, Theme.owned.opacity(0.3))
        case .tracked: return (Theme.tracked, Theme.trackedBg, Theme.tracked.opacity(0.3))
        case .neutral: return (Theme.textSecondary, Theme.untrackedBg, Theme.border)
        case .accent: return (Theme.accent, Theme.accent.opacity(0.12), Theme.accent.opacity(0.45))
        case .danger: return (Theme.danger, Theme.danger.opacity(0.12), Theme.danger.opacity(0.4))
        }
    }
}

/// components/resolution-badge.tsx — the 4K / HDR / audio chips for a file the
/// server described (`library.file` on the title page).
struct QualityBadges: View {
    let file: API.FileDetails
    var showsAudio = false

    var body: some View {
        HStack(spacing: 4) {
            if let tier = file.resolutionTier, tier.isKnown {
                TonePill(text: tier.rawValue, tone: tier == .uhd ? .accent : .neutral, small: true)
            }
            if let hdr = file.dynamicRangeLabel {
                TonePill(text: hdr == "Dolby Vision" ? "DV" : hdr, tone: .owned, small: true)
            }
            if showsAudio, let audio = Quality.audioLabel(file.audioCodec) {
                TonePill(text: audio, tone: .tracked, small: true)
            }
        }
    }
}

struct SectionTitle: View {
    let text: String
    var size: CGFloat = 20

    var body: some View {
        Text(text)
            .font(.marqueeDisplay(size))
            .foregroundStyle(Theme.textPrimary)
    }
}

/// `.caps` — the mockup's 10.5/600/0.08em muted label ("CURRENTLY STREAMING
/// ON", "LOCATION").
struct CapsLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 10.5, weight: .semibold))
            .tracking(0.84)
            .foregroundStyle(Theme.textMuted)
    }
}

struct SettingsSectionLabel: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 10.5, weight: .semibold))
            .tracking(1)
            .foregroundStyle(Theme.textMuted)
    }
}

/// Brand wordmark with the accent dot (sidebar / auth screens).
struct MarqueeWordmark: View {
    var size: CGFloat = 24

    var body: some View {
        Text("Marquee")
            .font(.marqueeDisplay(size, weight: .medium))
            .foregroundStyle(Theme.textPrimary)
            .overlay(alignment: .topTrailing) {
                Circle()
                    .fill(Theme.accent)
                    .frame(width: size * 0.25, height: size * 0.25)
                    .offset(x: size * 0.42, y: size * 0.05)
            }
            .padding(.trailing, size * 0.4)
    }
}

struct InlineMessage: View {
    let text: String
    var isError = true

    var body: some View {
        Label(text, systemImage: isError ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
            .font(.system(size: 12))
            .foregroundStyle(isError ? Theme.danger : Theme.owned)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct EmptyStateView: View {
    let title: String
    var message: String?
    var systemImage = "film.stack"
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 34, weight: .light))
                .foregroundStyle(Theme.textMuted)
            Text(title)
                .font(.marqueeDisplay(22))
                .foregroundStyle(Theme.textPrimary)
                .multilineTextAlignment(.center)
            if let message {
                Text(message)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 440)
            }
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(AccentButtonStyle())
                    .padding(.top, 6)
            }
        }
        .padding(40)
        .frame(maxWidth: .infinity)
    }
}

struct LoadingView: View {
    var label = "Loading…"

    var body: some View {
        VStack(spacing: 10) {
            ProgressView().controlSize(.regular)
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(Theme.textMuted)
        }
        .frame(maxWidth: .infinity, minHeight: 240)
    }
}

/// Selectable path + Copy button (file-details-section / webhook URL rows).
struct CopyField: View {
    /// `.path` is the mockup's `.pathf`: one 32pt box, radius 8, with the
    /// Copy button inside it.
    enum Variant {
        case standard
        case path
    }

    let value: String
    var label: String?
    var variant: Variant = .standard

    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let label {
                Text(label)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textMuted)
            }
            switch variant {
            case .standard:
                HStack(spacing: 8) {
                    field
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.bg0, in: RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.border))
                    copyButton
                        .buttonStyle(OutlineButtonStyle(compact: true))
                }
            case .path:
                HStack(spacing: 8) {
                    field.frame(maxWidth: .infinity, alignment: .leading)
                    copyButton.buttonStyle(CopyChipButtonStyle())
                }
                .padding(.leading, 10)
                .padding(.trailing, 4)
                .frame(height: 32)
                .background(Theme.bg0, in: RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.border))
            }
        }
    }

    private var field: some View {
        Text(value)
            .font(.system(size: variant == .path ? 11 : 11.5, design: .monospaced))
            .foregroundStyle(variant == .path ? Theme.textSecondary : Theme.textPrimary)
            .lineLimit(1)
            .truncationMode(variant == .path ? .tail : .middle)
            .textSelection(.enabled)
            .help(value)
    }

    private var copyButton: some View {
        Button(copied ? "Copied" : "Copy") {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(value, forType: .string)
            copied = true
            Task {
                try? await Task.sleep(for: .seconds(1.5))
                copied = false
            }
        }
    }
}

/// `.copy` — the small filled chip inside a `.path` CopyField.
private struct CopyChipButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Theme.textPrimary)
            .padding(.horizontal, 8)
            .frame(height: 24)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(configuration.isPressed ? Theme.borderStrong : Theme.bg3)
            )
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Theme.borderStrong))
            .contentShape(RoundedRectangle(cornerRadius: 6))
    }
}

/// One row that never wraps: every item keeps its natural width and the row
/// overflows to the right instead of stacking a second line. The caller clips
/// the row and fades its trailing edge, so an item is cut off cleanly rather
/// than dropped (the mockup's keyword row).
struct SingleRowLayout: Layout {
    var spacing: CGFloat = 6

    /// How much of the trailing edge the fade covers, so a caller can mask a
    /// cut-off item instead of slicing it in half.
    static let fadeWidth: CGFloat = 28

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        var width: CGFloat = 0
        var height: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            width += (width == 0 ? 0 : spacing) + size.width
            height = max(height, size.height)
        }
        return CGSize(width: min(width, proposal.width ?? .infinity), height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            subview.place(at: CGPoint(x: x, y: bounds.minY), proposal: ProposedViewSize(size))
            x += size.width + spacing
        }
    }
}

extension View {
    /// Clips a `SingleRowLayout` row and fades its last 28pt, so whatever
    /// overflows disappears into the background instead of being chopped.
    func fadingTrailingEdge() -> some View {
        clipped()
            .mask(alignment: .leading) {
                HStack(spacing: 0) {
                    Rectangle()
                    LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
                        .frame(width: SingleRowLayout.fadeWidth)
                }
            }
    }
}

/// Wrapping horizontal layout for chips/keywords/studios.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var lineHeight: CGFloat = 0
        var widest: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > maxWidth {
                y += lineHeight + lineSpacing
                x = 0
                lineHeight = 0
            }
            x += size.width + spacing
            widest = max(widest, x - spacing)
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: proposal.width ?? widest, height: y + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var lineHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                y += lineHeight + lineSpacing
                x = bounds.minX
                lineHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}
