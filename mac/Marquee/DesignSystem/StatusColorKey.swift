import SwiftUI

/// components/status-legend.tsx — a small "?" beside a poster grid that opens
/// a popover explaining the status colors: each library state with its
/// swatch and a one-line meaning.
struct StatusColorKey: View {
    @State private var showing = false

    var body: some View {
        Button {
            showing.toggle()
        } label: {
            Text("?")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(showing ? Theme.accent : Theme.textSecondary)
                .frame(width: 24, height: 24)
                .overlay(Circle().strokeBorder(showing ? Theme.accent : Theme.border, lineWidth: 1))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .help("What do the colors mean?")
        .accessibilityLabel("What do the colors mean?")
        .popover(isPresented: $showing, arrowEdge: .bottom) {
            StatusColorKeyList()
        }
    }
}

/// The popover's content, on its own so it can be previewed and tested.
struct StatusColorKeyList: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("What do the colors mean?")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.textPrimary)
            ForEach(API.LibraryStatus.knownCases, id: \.rawValue) { status in
                HStack(alignment: .top, spacing: 10) {
                    swatch(for: status)
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
            }
        }
        .padding(14)
        .frame(width: 280, alignment: .leading)
    }

    /// The poster strip's color, or a plain outline for "not in your
    /// library", which gets no strip.
    @ViewBuilder
    private func swatch(for status: API.LibraryStatus) -> some View {
        if let color = Theme.statusStrip(status) {
            Circle().fill(color).frame(width: 12, height: 12)
        } else {
            Circle().strokeBorder(Theme.textMuted, lineWidth: 1).frame(width: 12, height: 12)
        }
    }
}
