import SwiftUI

/// components/status-legend.tsx — a small "Color key" pill beside a poster
/// grid, led by a row of swatch dots, that opens a popover explaining the
/// status colors: each library state with its swatch and a one-line meaning.
struct StatusColorKey: View {
    @State private var showing = false
    @State private var hovering = false

    /// The swatch dots on the pill: every status that gets a poster strip.
    nonisolated static var pillStatuses: [API.LibraryStatus] {
        API.LibraryStatus.knownCases.filter { Theme.statusStrip($0) != nil }
    }

    var body: some View {
        let active = showing || hovering
        Button {
            showing.toggle()
        } label: {
            HStack(spacing: 6) {
                HStack(spacing: 2) {
                    ForEach(Self.pillStatuses, id: \.rawValue) { status in
                        Circle()
                            .fill(Theme.statusStrip(status) ?? Theme.textMuted)
                            .frame(width: 6, height: 6)
                    }
                }
                Text("Color key")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(active ? Theme.accent : Theme.textSecondary)
            }
            .padding(.horizontal, 9)
            .frame(height: 22)
            .overlay(Capsule().strokeBorder(active ? Theme.accent : Theme.border, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .fixedSize()
        .onHover { hovering = $0 }
        .help("What do the colors mean?")
        .accessibilityLabel("Color key: what do the colors mean?")
        .popover(isPresented: $showing, arrowEdge: .bottom) {
            StatusColorKeyList()
                .padding(14)
                .frame(width: 290, alignment: .leading)
        }
    }
}

/// The popover's content, and the Help page's list: each status's swatch,
/// name and meaning, then the Radarr/Sonarr footnote.
struct StatusColorKeyList: View {
    /// Shown under the rows (status-legend.tsx's footnote).
    nonisolated static let footnote = "Same colors as Radarr and Sonarr."

    var showsHeading = true
    var rowSpacing: CGFloat = 10

    var body: some View {
        VStack(alignment: .leading, spacing: rowSpacing) {
            if showsHeading {
                Text("What do the colors mean?")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
            }
            ForEach(API.LibraryStatus.knownCases, id: \.rawValue) { status in
                HStack(alignment: .top, spacing: 10) {
                    StatusSwatch(status: status)
                        .padding(.top, 2)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(status.name)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(Theme.textPrimary)
                        Text(status.meaning)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .accessibilityElement(children: .combine)
            }
            Text(Self.footnote)
                .font(.system(size: 10.5))
                .foregroundStyle(Theme.textMuted)
                .padding(.top, 2)
        }
    }
}

/// The poster strip's color as a dot, or a plain outline for "not in your
/// library", which gets no strip.
struct StatusSwatch: View {
    let status: API.LibraryStatus
    var size: CGFloat = 12

    var body: some View {
        if let color = Theme.statusStrip(status) {
            Circle().fill(color).frame(width: size, height: size)
        } else {
            Circle().strokeBorder(Theme.textMuted, lineWidth: 1).frame(width: size, height: size)
        }
    }
}
