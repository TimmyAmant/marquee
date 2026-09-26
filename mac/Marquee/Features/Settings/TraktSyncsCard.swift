import SwiftUI
import Observation

// Settings › Account › Trakt lists (0.49+, api-v1.md §11): keep a public
// Trakt watchlist or list in sync — new titles on it are requested as you
// every few hours. Every account has it; the admin also sees everyone's. An
// older server (404) shows nothing.

/// The card's state, apart from the view so it's testable.
@MainActor
@Observable
final class TraktSyncsModel {
    static let bothOffMessage = String(localized: "Pick movies, TV shows or both.")
    static let blankLinkMessage = String(localized: "Paste a Trakt list or watchlist link, like https://trakt.tv/users/someone/watchlist.")

    /// nil until the first load answers.
    private(set) var syncs: [API.TraktSync]?
    /// Trakt is connected on the server; without it nothing can be added.
    private(set) var available = true
    private(set) var maxPerMember = 10
    private(set) var loadError: String?
    /// An older server (404): the card isn't shown at all.
    private(set) var isUnavailable = false

    // The add form.
    var url = ""
    var movies = true
    var tv = true
    var requestExisting = false
    private(set) var isAdding = false
    private(set) var addError: String?

    private(set) var busyIds: Set<String> = []
    private(set) var rowErrors: [String: String] = [:]
    /// The row asking "Stop syncing …?".
    var confirmingRemoveId: String?

    var isVisible: Bool { !isUnavailable && (syncs != nil || loadError != nil) }
    var canAdd: Bool { available && !isAdding }

    func load(_ api: MarqueeAPI, all: Bool) async {
        do {
            let fresh = try await api.traktSyncs.list(all: all)
            if Task.isCancelled { return }
            apply(fresh)
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch APIError.notFound {
            isUnavailable = true
        } catch APIError.forbidden where all {
            // Not the admin after all: just your own.
            await load(api, all: false)
        } catch {
            if syncs == nil { loadError = error.localizedDescription }
        }
    }

    func apply(_ list: API.TraktSyncs) {
        syncs = list.results
        available = list.available
        maxPerMember = list.maxPerMember
        loadError = nil
        isUnavailable = false
    }

    /// The form as the server expects it; nil when the link is blank or
    /// both kinds are off (`formProblem` says which).
    var request: API.CreateTraktSyncRequest? {
        guard formProblem == nil else { return nil }
        return API.CreateTraktSyncRequest(
            url: url.trimmingCharacters(in: .whitespacesAndNewlines),
            movies: movies,
            tv: tv,
            requestExisting: requestExisting
        )
    }

    var formProblem: String? {
        if url.nonBlank == nil { return Self.blankLinkMessage }
        if !movies && !tv { return Self.bothOffMessage }
        return nil
    }

    func add(_ api: MarqueeAPI) async {
        guard canAdd else { return }
        guard let request else {
            addError = formProblem
            return
        }
        isAdding = true
        addError = nil
        do {
            let sync = try await api.traktSyncs.add(request)
            var list = syncs ?? []
            list.removeAll { $0.id == sync.id }
            list.append(sync)
            syncs = list
            url = ""
            movies = true
            tv = true
            requestExisting = false
        } catch {
            addError = error.localizedDescription
        }
        isAdding = false
    }

    /// The Movies / TV shows switches; never both off.
    func setTypes(_ sync: API.TraktSync, movies: Bool? = nil, tv: Bool? = nil, _ api: MarqueeAPI) async {
        let body = API.UpdateTraktSyncRequest(movies: movies, tv: tv)
        guard (body.movies ?? sync.movies) || (body.tv ?? sync.tv) else {
            rowErrors[sync.id] = Self.bothOffMessage
            return
        }
        await change(sync.id) { try await api.traktSyncs.update(sync.id, body) }
    }

    /// "Check now". A 429 says "Checked a moment ago. Try again in a minute."
    func checkNow(_ sync: API.TraktSync, _ api: MarqueeAPI) async {
        await change(sync.id) { try await api.traktSyncs.sync(sync.id) }
    }

    func remove(_ sync: API.TraktSync, _ api: MarqueeAPI) async {
        guard !busyIds.contains(sync.id) else { return }
        busyIds.insert(sync.id)
        rowErrors[sync.id] = nil
        do {
            try await api.traktSyncs.remove(sync.id)
            drop(sync.id)
        } catch APIError.notFound {
            drop(sync.id)
        } catch {
            rowErrors[sync.id] = error.localizedDescription
        }
        busyIds.remove(sync.id)
    }

    private func change(_ id: String, _ call: () async throws -> API.TraktSync) async {
        guard !busyIds.contains(id) else { return }
        busyIds.insert(id)
        rowErrors[id] = nil
        do {
            let updated = try await call()
            if let index = syncs?.firstIndex(where: { $0.id == id }) { syncs?[index] = updated }
        } catch {
            rowErrors[id] = error.localizedDescription
        }
        busyIds.remove(id)
    }

    private func drop(_ id: String) {
        syncs?.removeAll { $0.id == id }
        rowErrors[id] = nil
        if confirmingRemoveId == id { confirmingRemoveId = nil }
    }

    // MARK: Labels

    /// "Checked 2 hours ago · 4 titles requested so far", or "Not checked yet".
    static func statusLine(_ sync: API.TraktSync, now: Date = Date()) -> String {
        var parts = [
            sync.lastSyncedAt.map { date in
                let when = Format.timeAgo(date, now: now)
                return String(localized: "Checked \(when)")
            } ?? String(localized: "Not checked yet")
        ]
        if sync.requestedCount > 0 {
            let count = sync.requestedCount
            parts.append(String(localized: "\(count) titles requested so far"))
        }
        return parts.joined(separator: " · ")
    }

    /// "Anna's" when it isn't yours; nil for your own.
    static func ownerLabel(_ sync: API.TraktSync, viewerId: UUID?) -> String? {
        guard let owner = sync.owner, owner.id != viewerId else { return nil }
        return String(localized: "\(owner.label)'s")
    }
}

/// The "Trakt lists" section: hidden until the server answers, and for good
/// on an older one.
struct TraktSyncsSection: View {
    @Environment(AppModel.self) private var model
    @State private var trakt = TraktSyncsModel()

    var body: some View {
        Group {
            if trakt.isVisible {
                SettingsSectionLabel(text: String(localized: "Trakt lists"))
                TraktSyncsCard(trakt: trakt)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .cardSurface()
            }
        }
        .task(id: ReloadKey(token: model.reloadToken, remote: model.events.remoteRevision(of: .settings))) {
            await trakt.load(model.api, all: model.viewer?.isAdmin == true)
        }
    }
}

struct TraktSyncsCard: View {
    @Bindable var trakt: TraktSyncsModel
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Keep a Trakt list in sync")
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.textPrimary)
                Text("New movies and shows added to a public Trakt watchlist or list are requested for you every few hours, the same as pressing Request.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let loadError = trakt.loadError, trakt.syncs == nil {
                InlineMessage(text: loadError)
            }
            if let syncs = trakt.syncs, !syncs.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(syncs.enumerated()), id: \.element.id) { index, sync in
                        if index > 0 { Divider().overlay(Theme.border) }
                        row(sync)
                    }
                }
            }
            Divider().overlay(Theme.border)
            addForm
        }
    }

    // MARK: Rows

    private func row(_ sync: API.TraktSync) -> some View {
        let busy = trakt.busyIds.contains(sync.id)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(sync.name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                if let owner = TraktSyncsModel.ownerLabel(sync, viewerId: model.viewer?.id) {
                    Text(owner)
                        .font(.system(size: 11.5))
                        .foregroundStyle(Theme.textSecondary)
                }
                Spacer(minLength: 8)
                if let link = URL(string: sync.url), link.scheme == "https" {
                    Button("Open on Trakt") { openURL(link) }
                        .buttonStyle(QuietButtonStyle())
                        .font(.system(size: 12))
                }
            }
            Text(sync.url)
                .font(.system(size: 11.5))
                .foregroundStyle(Theme.textMuted)
                .lineLimit(1)
                .truncationMode(.middle)
                .textSelection(.enabled)
            HStack(spacing: 16) {
                Toggle("Movies", isOn: Binding(
                    get: { sync.movies },
                    set: { on in
                        let api = model.api
                        Task { await trakt.setTypes(sync, movies: on, api) }
                    }
                ))
                Toggle("TV shows", isOn: Binding(
                    get: { sync.tv },
                    set: { on in
                        let api = model.api
                        Task { await trakt.setTypes(sync, tv: on, api) }
                    }
                ))
            }
            .toggleStyle(.checkbox)
            .font(.system(size: 12.5))
            .foregroundStyle(Theme.textSecondary)
            .disabled(busy)

            Text(TraktSyncsModel.statusLine(sync))
                .font(.system(size: 12))
                .foregroundStyle(Theme.textMuted)

            HStack(spacing: 12) {
                Button(busy ? "Checking…" : "Check now") {
                    let api = model.api
                    Task { await trakt.checkNow(sync, api) }
                }
                .buttonStyle(OutlineButtonStyle(compact: true))
                .disabled(busy || !trakt.available)
                removeControl(sync, busy: busy)
            }

            if let lastError = sync.lastError.nonBlank { InlineMessage(text: lastError) }
            if let error = trakt.rowErrors[sync.id] { InlineMessage(text: error) }
        }
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private func removeControl(_ sync: API.TraktSync, busy: Bool) -> some View {
        if trakt.confirmingRemoveId == sync.id {
            HStack(spacing: 8) {
                Text("Stop syncing \(sync.name)? Its requests stay.")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textSecondary)
                Button(busy ? "Removing…" : "Remove") {
                    let api = model.api
                    Task { await trakt.remove(sync, api) }
                }
                .buttonStyle(QuietButtonStyle(color: Theme.danger))
                .disabled(busy)
                Button("Cancel") { trakt.confirmingRemoveId = nil }
                    .buttonStyle(QuietButtonStyle())
                    .disabled(busy)
            }
            .font(.system(size: 12))
        } else {
            Button("Remove") { trakt.confirmingRemoveId = sync.id }
                .buttonStyle(QuietButtonStyle(color: Theme.danger))
                .font(.system(size: 12))
                .disabled(busy)
        }
    }

    // MARK: Add

    private var addForm: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !trakt.available {
                InlineMessage(text: String(localized: "Trakt isn't connected. The admin can connect it in Settings → Integrations."))
            }
            SettingsField(label: String(localized: "Trakt link"), text: $trakt.url, placeholder: "https://trakt.tv/users/someone/watchlist")
            HStack(spacing: 16) {
                Toggle("Movies", isOn: $trakt.movies)
                Toggle("TV shows", isOn: $trakt.tv)
                Toggle("Also request what's on it now", isOn: $trakt.requestExisting)
            }
            .toggleStyle(.checkbox)
            .font(.system(size: 12.5))
            .foregroundStyle(Theme.textSecondary)
            if let error = trakt.addError { InlineMessage(text: error) }
            Button(trakt.isAdding ? "Adding…" : "Keep in sync") {
                let api = model.api
                Task { await trakt.add(api) }
            }
            .buttonStyle(AccentButtonStyle())
            .disabled(!trakt.canAdd)
        }
        .disabled(!trakt.available)
    }
}
