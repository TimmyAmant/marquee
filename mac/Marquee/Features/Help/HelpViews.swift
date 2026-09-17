import SwiftUI

/// app/help/errors/page.tsx — the reference comes from `GET /help/errors`, so
/// it always matches the server's own wording.
struct ErrorReferenceView: View {
    @Environment(AppModel.self) private var model
    @State private var categories: [API.ErrorReferenceCategory]?
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Error reference")
                        .font(.marqueeDisplay(30))
                        .foregroundStyle(Theme.textPrimary)
                    Text("What every error message in Marquee actually means, and what to do about it. If the exact wording you saw isn't below, it's most likely a message passed straight through from Sonarr, Radarr, Plex, or Jellyfin themselves — check that service's own logs.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let categories {
                    if categories.isEmpty {
                        Text("Your server didn't return an error reference.")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.textMuted)
                    }
                    ForEach(categories) { category in
                        VStack(alignment: .leading, spacing: 12) {
                            SectionTitle(text: category.title)
                            ForEach(category.entries) { entry in
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("“\(entry.message)”")
                                        .font(.system(size: 12.5, design: .monospaced))
                                        .foregroundStyle(Theme.danger)
                                        .textSelection(.enabled)
                                    Text(entry.meaning)
                                        .font(.system(size: 13))
                                        .foregroundStyle(Theme.textPrimary)
                                        .fixedSize(horizontal: false, vertical: true)
                                    (Text("What to do: ").foregroundStyle(Theme.textMuted) + Text(entry.whatToDo).foregroundStyle(Theme.textSecondary))
                                        .font(.system(size: 13))
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .cardSurface(padding: 16)
                            }
                        }
                    }
                } else if let error {
                    InlineMessage(text: error)
                } else {
                    LoadingView()
                }
            }
            .padding(32)
            .frame(maxWidth: 820, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Theme.bg0)
        .navigationTitle("Error Reference")
        .task(id: model.reloadToken) {
            do {
                let fresh = try await model.api.help.errors()
                if Task.isCancelled { return }
                categories = fresh
                error = nil
            } catch let failure as APIError where failure.isCancellation {
                return
            } catch {
                if categories == nil { self.error = error.localizedDescription }
            }
        }
    }
}

/// app/changelog/page.tsx + components/changelog-list.tsx.
struct ChangelogView: View {
    @Environment(AppModel.self) private var model
    @State private var entries: [API.ChangelogEntry]?
    @State private var error: String?
    @State private var openEntry: API.ChangelogEntry?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Releases")
                        .font(.marqueeDisplay(30))
                        .foregroundStyle(Theme.textPrimary)
                    Text("What's changed, release by release.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textSecondary)
                }

                if let entries {
                    if entries.isEmpty {
                        Text("Your server didn't return a changelog.")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.textMuted)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                                if index > 0 { Divider().overlay(Theme.border) }
                                HStack(spacing: 14) {
                                    Text(entry.daysAgo())
                                        .font(.system(size: 12))
                                        .foregroundStyle(Theme.textMuted)
                                        .frame(width: 90, alignment: .leading)
                                    Text("Release v\(entry.version)")
                                        .font(.system(size: 14, weight: .medium))
                                        .foregroundStyle(Theme.textPrimary)
                                    if index == 0 {
                                        TonePill(text: "Latest", tone: .accent, small: true)
                                    }
                                    Spacer()
                                    Button {
                                        openEntry = entry
                                    } label: {
                                        Label("View Changelog", systemImage: "doc.text")
                                    }
                                    .buttonStyle(OutlineButtonStyle(compact: true))
                                }
                                .padding(.horizontal, 18)
                                .padding(.vertical, 14)
                            }
                        }
                        .cardSurface(padding: 0)
                    }
                } else if let error {
                    InlineMessage(text: error)
                } else {
                    LoadingView()
                }
            }
            .padding(32)
            .frame(maxWidth: 760, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Theme.bg0)
        .navigationTitle("Releases")
        .task(id: model.reloadToken) {
            do {
                let fresh = try await model.api.about.changelog()
                if Task.isCancelled { return }
                entries = fresh
                error = nil
            } catch let failure as APIError where failure.isCancellation {
                return
            } catch {
                if entries == nil { self.error = error.localizedDescription }
            }
        }
        .sheet(item: $openEntry) { entry in
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("v\(entry.version) Changelog")
                            .font(.marqueeDisplay(22))
                        Text(entry.date.mediumLabel)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.textMuted)
                    }
                    Spacer()
                    Button("Done") { openEntry = nil }
                        .buttonStyle(AccentButtonStyle(compact: true))
                        .keyboardShortcut(.cancelAction)
                }
                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(Array(entry.changes.enumerated()), id: \.offset) { _, change in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text("–").foregroundStyle(Theme.accent)
                                Text(change)
                                    .foregroundStyle(Theme.textSecondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .font(.system(size: 13))
                        }
                    }
                }
            }
            .padding(24)
            .frame(width: 560, height: 460)
            .background(Theme.bg1)
        }
    }
}
