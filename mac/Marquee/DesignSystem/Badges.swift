import SwiftUI

/// Which palette a pill or badge draws itself in. The seven library-status
/// tones (owned, downloading, ready, missing, unmonitored, soon, neutral) match
/// lib/library/status-tone.ts on the website and Radarr's/Sonarr's own
/// legends. `info` is the same blue as `soon` for chips that aren't a
/// library status (pending, requested, monitored season, audio codec).
enum BadgeTone: Hashable {
    case owned
    case downloading
    case ready
    case missing
    case unmonitored
    case soon
    case neutral
    case info
    case accent
    case danger

    /// (text, fill, border) for a tinted tone, or nil for the neutral grey.
    var palette: (foreground: Color, background: Color, border: Color)? {
        switch self {
        case .owned: return (Theme.owned, Theme.ownedBg, Theme.owned.opacity(0.3))
        case .downloading: return (Theme.downloading, Theme.downloadingBg, Theme.downloading.opacity(0.3))
        case .ready: return (Theme.ready, Theme.readyBg, Theme.ready.opacity(0.3))
        case .missing: return (Theme.missing, Theme.missingBg, Theme.missing.opacity(0.3))
        case .unmonitored: return (Theme.unmonitored, Theme.unmonitoredBg, Theme.unmonitored.opacity(0.3))
        case .soon: return (Theme.soon, Theme.soonBg, Theme.soon.opacity(0.3))
        case .info: return (Theme.info, Theme.infoBg, Theme.info.opacity(0.3))
        case .accent: return (Theme.accent, Theme.accent.opacity(0.12), Theme.accent.opacity(0.45))
        case .danger: return (Theme.danger, Theme.danger.opacity(0.12), Theme.danger.opacity(0.4))
        case .neutral: return nil
        }
    }

    /// `palette`, falling back to the neutral grey pill.
    var resolvedPalette: (foreground: Color, background: Color, border: Color) {
        palette ?? (Theme.textSecondary, Theme.untrackedBg, Theme.border)
    }
}

extension API.LibraryStatus {
    /// lib/library/status-tone.ts `statusTone`: every status its own color.
    var tone: BadgeTone {
        switch self {
        case .owned: return .owned
        case .trackedDownloading: return .downloading
        case .readyToMove: return .ready
        case .trackedMonitored: return .missing
        case .trackedUnmonitored: return .unmonitored
        case .comingSoon: return .soon
        case .untracked, .unknown: return .neutral
        }
    }
}

extension API.RequestTone {
    /// requests/page.tsx myRequestBadge's colors.
    var badgeTone: BadgeTone {
        switch self {
        case .owned: return .owned
        case .downloading: return .downloading
        case .pending, .approved: return .info
        case .comingSoon: return .soon
        case .declined, .unknown: return .neutral
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
    /// How far a download is (0–100), shown after "Downloading".
    var progress: Int? = nil

    private var text: String {
        let label = compact ? status.compactLabel : status.label
        guard status == .trackedDownloading, let progress else { return label }
        return "\(label) · \(progress)%"
    }

    private var colors: (foreground: Color, background: Color, border: Color) {
        status.tone.resolvedPalette
    }

    var body: some View {
        if status.isKnown {
            let colors = self.colors
            HStack(spacing: dotGap) {
                Circle()
                    .fill(colors.foreground)
                    .frame(width: dotSize, height: dotSize)
                    .overlay(Circle().strokeBorder(colors.foreground.opacity(0.18), lineWidth: large ? 3 : 0))
                Text(text)
            }
            .font(.system(size: Metrics.text(large ? 13 : (compact ? 10 : 11.5)), weight: compact || large ? .semibold : .medium))
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
        let (foreground, background, border) = tone.resolvedPalette
        Text(text)
            .font(.system(size: Metrics.text(small ? 10 : 11.5), weight: .medium))
            .foregroundStyle(foreground)
            .padding(.horizontal, small ? 7 : 10)
            .padding(.vertical, small ? 2 : 3.5)
            .background(Capsule().fill(background))
            .overlay(Capsule().strokeBorder(border, lineWidth: 1))
            .fixedSize()
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
            .font(.system(size: Metrics.text(10.5), weight: .semibold))
            .tracking(0.84)
            .foregroundStyle(Theme.textMuted)
    }
}

struct SettingsSectionLabel: View {
    let text: String

    var body: some View {
        Text(text.localizedUppercase)
            .font(.system(size: Metrics.text(10.5), weight: .semibold))
            .tracking(1)
            .foregroundStyle(Theme.textMuted)
    }
}

/// Brand wordmark with the accent dot (navigation menu / auth screens).
struct MarqueeWordmark: View {
    var size: CGFloat = 24

    var body: some View {
        Text(verbatim: "Marquee")
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
            .font(.system(size: Metrics.text(12)))
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
                .font(.system(size: Metrics.text(34), weight: .light))
                .foregroundStyle(Theme.textMuted)
            Text(title)
                .font(.marqueeDisplay(22))
                .foregroundStyle(Theme.textPrimary)
                .multilineTextAlignment(.center)
            if let message {
                Text(message)
                    .font(.system(size: Metrics.text(13)))
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
    var label = String(localized: "Loading…")

    var body: some View {
        VStack(spacing: 10) {
            ProgressView().controlSize(.regular)
            Text(label)
                .font(.system(size: Metrics.text(12)))
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
                    .font(.system(size: Metrics.text(12)))
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
            .font(.system(size: Metrics.text(variant == .path ? 11 : 11.5), design: .monospaced))
            .foregroundStyle(variant == .path ? Theme.textSecondary : Theme.textPrimary)
            .lineLimit(1)
            .truncationMode(variant == .path ? .tail : .middle)
            .textSelection(.enabled)
            .help(value)
    }

    private var copyButton: some View {
        Button(copied ? "Copied" : "Copy") {
            Platform.copy(value)
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
            .font(.system(size: Metrics.text(11), weight: .semibold))
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

/// Wrapping horizontal layout for chips/keywords/studios.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8
    /// Centre each item vertically on its line instead of top-aligning it.
    var centersLines = false

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
        // Lines first, so each item can be centred on its line's midline
        // when `centersLines` is set (a row of pills of mixed heights).
        var lines: [[(index: Int, size: CGSize)]] = [[]]
        var x = bounds.minX
        for (index, subview) in subviews.enumerated() {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                lines.append([])
                x = bounds.minX
            }
            lines[lines.count - 1].append((index, size))
            x += size.width + spacing
        }
        var y = bounds.minY
        for line in lines where !line.isEmpty {
            let lineHeight = line.map(\.size.height).max() ?? 0
            var x = bounds.minX
            for item in line {
                let dy = centersLines ? (lineHeight - item.size.height) / 2 : 0
                subviews[item.index].place(at: CGPoint(x: x, y: y + dy), proposal: ProposedViewSize(item.size))
                x += item.size.width + spacing
            }
            y += lineHeight + lineSpacing
        }
    }
}
