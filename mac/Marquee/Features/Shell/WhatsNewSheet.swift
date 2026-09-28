import SwiftUI

/// components/whats-new.tsx: "What's new in Marquee 0.45.3", each release
/// with its date and changes, and OK at the bottom. OK, Return and Escape
/// all dismiss it (`WhatsNewModel.dismiss()`, through the sheet's onDismiss).
struct WhatsNewSheet: View {
    let content: WhatsNew.Content
    let seeAll: () -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    private static func installedMessage(_ version: String) -> String {
        #if os(macOS)
        String(localized: "Marquee for Mac \(version) is installed.")
        #else
        String(localized: "Marquee for iPhone \(version) is installed.")
        #endif
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("What's new in Marquee \(content.version)")
                .font(.marqueeDisplay(22))
                .foregroundStyle(Theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
                .padding(.horizontal, 24)
                .padding(.top, 22)
                .padding(.bottom, 12)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if let installed = content.installedAppVersion {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(Self.installedMessage(installed))
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Theme.textPrimary)
                            if let url = content.releaseNotesURL {
                                Button("Read the release notes on GitHub") { openURL(url) }
                                    .linkButtonStyle()
                                    .font(.system(size: 12.5))
                            }
                        }
                        .padding(.bottom, 14)
                    }
                    ForEach(Array(content.entries.enumerated()), id: \.element.id) { index, entry in
                        if index > 0 || content.installedAppVersion != nil {
                            Divider().overlay(Theme.border)
                        }
                        release(entry)
                            .padding(.vertical, 14)
                    }
                    if content.hasMore {
                        Text("And more in earlier releases.")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.textMuted)
                            .padding(.bottom, 8)
                    }
                }
                .padding(.horizontal, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            Divider().overlay(Theme.border)
            HStack {
                Button("See all changes") {
                    dismiss()
                    seeAll()
                }
                .buttonStyle(QuietButtonStyle())
                .font(.system(size: 12.5))
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Text("OK").frame(minWidth: 64)
                }
                .buttonStyle(AccentButtonStyle())
                .keyboardShortcut(.defaultAction)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
        }
        #if os(macOS)
        .frame(width: 520)
        .frame(minHeight: 260, maxHeight: 600)
        #endif
        .background(Theme.bg1)
        .onExitCommandIfAvailable { dismiss() }
    }

    private func release(_ entry: API.ChangelogEntry) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("Marquee \(entry.version)")
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                Text(entry.date.mediumLabel)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            ForEach(Array(entry.changes.enumerated()), id: \.offset) { _, change in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("•").foregroundStyle(Theme.textMuted)
                    // Verbatim: the changelog's quotes and ellipses are text.
                    Text(verbatim: change)
                        .font(.system(size: 12.5))
                        .lineSpacing(2)
                        .foregroundStyle(Theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)
                }
            }
        }
    }
}
