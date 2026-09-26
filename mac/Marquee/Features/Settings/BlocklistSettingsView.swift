import SwiftUI

/// app/settings/blocklist-settings.tsx — Settings › Account (admin), "Request
/// blocklist": what nobody may request. Titles are blocked from their page;
/// keywords and genres here. A server older than 0.41 answers 404, and then
/// the whole section stays hidden.
struct BlocklistSettingsSection: View {
    @Environment(AppModel.self) private var model

    @State private var entries: [API.BlocklistEntry]?
    @State private var unsupported = false
    @State private var loadError: String?
    @State private var removingIds: Set<String> = []
    @State private var listError: String?

    @State private var keyword = ""
    @State private var reason = ""
    @State private var blocking = false
    @State private var formError: String?

    var body: some View {
        if !unsupported {
            VStack(alignment: .leading, spacing: 14) {
                SettingsSectionLabel(text: "Request blocklist")
                Text("Titles and keywords nobody can request. You can still add them yourself.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.textSecondary)

                VStack(alignment: .leading, spacing: 0) {
                    list
                    Divider().overlay(Theme.border)
                    form
                        .padding(18)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardSurface(padding: 0)

                if let listError { InlineMessage(text: listError) }
            }
            .task(id: ReloadKey(token: model.reloadToken, local: model.events.revision(of: .settings))) {
                await load()
            }
        }
    }

    @ViewBuilder
    private var list: some View {
        if let entries {
            if entries.isEmpty {
                Text("Nothing blocked. Block a title from its page, or a keyword below.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textMuted)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 14)
            } else {
                ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                    if index > 0 { Divider().overlay(Theme.border) }
                    row(entry)
                }
            }
        } else if let loadError {
            InlineMessage(text: loadError)
                .padding(18)
        } else {
            ProgressView()
                .controlSize(.small)
                .padding(18)
        }
    }

    private func row(_ entry: API.BlocklistEntry) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                if let titleID = entry.titleID {
                    Button(entry.label) {
                        model.openTitle(titleID)
                        model.showMainWindow()
                    }
                    .buttonStyle(QuietButtonStyle(color: Theme.textPrimary))
                    .font(.system(size: 13.5))
                } else {
                    (Text("Keyword: ").foregroundStyle(Theme.textPrimary)
                        + Text(entry.keyword ?? "").fontWeight(.medium).foregroundStyle(Theme.textPrimary))
                        .font(.system(size: 13.5))
                }
                if let reason = entry.reason.nonBlank {
                    Text(reason)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(1)
                }
            }
            Spacer()
            Button(removingIds.contains(entry.id) ? "Removing…" : "Remove") { remove(entry) }
                .buttonStyle(QuietButtonStyle(color: Theme.danger))
                .font(.system(size: 12))
                .disabled(removingIds.contains(entry.id))
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                SettingsField(label: "Block a keyword or genre", text: $keyword, placeholder: "e.g. anime, reality, horror")
                Text("Any title with this TMDb keyword or genre can't be requested (you can still add it yourself).")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            SettingsField(label: "Reason (optional, shown to whoever asks)", text: $reason)
                .onChange(of: reason) { _, value in
                    if value.count > API.BlockTitleRequest.maxReasonLength {
                        reason = String(value.prefix(API.BlockTitleRequest.maxReasonLength))
                    }
                }
            if let formError { InlineMessage(text: formError) }
            Button(blocking ? "Blocking…" : "Block") { blockKeyword() }
                .buttonStyle(AccentButtonStyle())
                .disabled(blocking || keyword.nonBlank == nil)
        }
    }

    private func load() async {
        do {
            let fresh = try await model.api.blocklist.list()
            if Task.isCancelled { return }
            entries = fresh
            loadError = nil
        } catch APIError.notFound {
            unsupported = true
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            if entries == nil { loadError = error.localizedDescription }
        }
    }

    private func blockKeyword() {
        guard let keyword = keyword.nonBlank, !blocking else { return }
        formError = nil
        blocking = true
        let api = model.api
        let reason = reason
        Task {
            do {
                try await api.blocklist.blockKeyword(keyword, reason: reason)
                self.keyword = ""
                self.reason = ""
            } catch {
                formError = error.localizedDescription
            }
            blocking = false
        }
    }

    private func remove(_ entry: API.BlocklistEntry) {
        removingIds.insert(entry.id)
        listError = nil
        let api = model.api
        Task {
            do {
                try await api.blocklist.remove(entry.id)
                entries?.removeAll { $0.id == entry.id }
            } catch {
                listError = error.localizedDescription
            }
            removingIds.remove(entry.id)
        }
    }
}
