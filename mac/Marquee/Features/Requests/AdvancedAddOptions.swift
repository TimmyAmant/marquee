import SwiftUI

// "Advanced" under Approve (the review queue) and the admin's Add (the title
// page), 0.43+: pick which Sonarr/Radarr server a title goes to, and the
// quality profile, root folder, tags and series type it's added with.

/// The picks, starting from the default server's `defaults`.
struct AddOptionsSelection: Hashable, Sendable {
    let options: API.AddOptions
    /// nil only when no server is set up for this type.
    private(set) var serverId: String?
    var qualityProfileId: Int?
    var rootFolderPath: String?
    var tags: Set<Int> = []
    /// TV only; nil for movies.
    var seriesType: API.SeriesType?

    init(_ options: API.AddOptions) {
        self.options = options
        if let server = options.servers.first(where: \.isDefault) ?? options.servers.first {
            apply(server)
        }
    }

    var isTV: Bool { options.mediaType == .tv }

    var server: API.AddOptionsServer? {
        options.servers.first { $0.id == serverId }
    }

    /// Switching server starts over from that server's own defaults.
    mutating func selectServer(_ id: String) {
        guard let server = options.servers.first(where: { $0.id == id }) else { return }
        apply(server)
    }

    mutating func setTag(_ id: Int, on: Bool) {
        if on { tags.insert(id) } else { tags.remove(id) }
    }

    private mutating func apply(_ server: API.AddOptionsServer) {
        serverId = server.id
        qualityProfileId = server.defaults.qualityProfileId
        rootFolderPath = server.defaults.rootFolderPath
        tags = Set(server.defaults.tags)
        seriesType = isTV ? (server.defaults.seriesType ?? (options.isAnime ? .anime : .standard)) : nil
    }

    /// The quality profiles to offer: the server's, plus the current pick if
    /// the server's list doesn't have it (so the picker never shows blank).
    var qualityProfileChoices: [API.QualityProfile] {
        let listed = server?.qualityProfiles ?? []
        guard let qualityProfileId, !listed.contains(where: { $0.id == qualityProfileId }) else { return listed }
        return listed + [API.QualityProfile(id: qualityProfileId, name: "Profile \(qualityProfileId)")]
    }

    /// The root folders to offer, with the current pick kept the same way.
    var rootFolderChoices: [String] {
        let listed = (server?.rootFolders ?? []).map(\.path)
        guard let rootFolderPath, !listed.contains(rootFolderPath) else { return listed }
        return listed + [rootFolderPath]
    }

    /// What Approve / Add sends: everything picked, so what's on screen is
    /// what's used. nil when there's no server to pick.
    var overrides: API.AddOverrides? {
        guard let serverId else { return nil }
        return API.AddOverrides(
            serverId: serverId,
            qualityProfileId: qualityProfileId,
            rootFolderPath: rootFolderPath,
            tags: tags.sorted(),
            seriesType: isTV ? seriesType : nil
        )
    }
}

/// The "Advanced" disclosure's state. Until it's opened (and its options have
/// loaded) there are no overrides, so Approve / Add send no body at all —
/// exactly as before 0.43.
struct AdvancedAddOptions: Equatable, Sendable {
    enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded(AddOptionsSelection)
        case failed(String)
        /// The server predates add-options (404): "Advanced" goes away.
        case unavailable
    }

    var isExpanded = false
    var phase: Phase = .idle

    /// Offer "Advanced" at all.
    var isOffered: Bool { phase != .unavailable }
    var isLoading: Bool { isExpanded && (phase == .loading || phase == .idle) }

    /// nil (send no body) unless "Advanced" is open with its options loaded.
    var overrides: API.AddOverrides? {
        guard isExpanded, case let .loaded(selection) = phase else { return nil }
        return selection.overrides
    }

    var selection: AddOptionsSelection? {
        get {
            if case let .loaded(selection) = phase { return selection }
            return nil
        }
        set {
            if let newValue { phase = .loaded(newValue) }
        }
    }

    mutating func toggle() {
        isExpanded.toggle()
        // Opening again after a failure tries again.
        if isExpanded, case .failed = phase { phase = .idle }
    }

    /// Closed and forgotten (after the title was added), unless the server
    /// said it can't do this at all.
    mutating func reset() {
        isExpanded = false
        if phase != .unavailable { phase = .idle }
    }

    mutating func finishLoading(_ result: Result<API.AddOptions, any Error>) {
        switch result {
        case let .success(options):
            phase = .loaded(AddOptionsSelection(options))
        case let .failure(error):
            if let failure = error as? APIError, failure == .notFound {
                phase = .unavailable
                isExpanded = false
            } else if let failure = error as? APIError, failure.isCancellation {
                phase = .idle
            } else {
                phase = .failed(error.localizedDescription)
            }
        }
    }
}

/// The small "Advanced ›" toggle.
struct AdvancedAddToggle: View {
    @Binding var advanced: AdvancedAddOptions

    var body: some View {
        Button {
            advanced.toggle()
        } label: {
            HStack(spacing: 3) {
                Text("Advanced")
                Image(systemName: advanced.isExpanded ? "chevron.down" : "chevron.right")
                    .font(.system(size: 9, weight: .semibold))
            }
        }
        .buttonStyle(QuietButtonStyle())
        .font(.system(size: 11.5))
        .help("Pick the server, quality profile, root folder and tags it's added with.")
    }
}

/// The pickers, shown while "Advanced" is open. Loads the options itself the
/// first time it appears.
struct AddOptionsPanel: View {
    @Binding var advanced: AdvancedAddOptions
    let mediaType: API.MediaType
    let tmdbId: Int
    let is4k: Bool
    /// "Add to 4K Sonarr" when the page shows more than one panel.
    var heading: String?

    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let heading {
                CapsLabel(text: heading.uppercased())
            }
            content
        }
        .padding(12)
        .frame(maxWidth: 520, alignment: .leading)
        .background(Theme.bg1, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.border))
        .task { await loadIfNeeded() }
    }

    @ViewBuilder
    private var content: some View {
        switch advanced.phase {
        case .idle, .loading:
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Checking your \(mediaType.arrName) servers…")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textMuted)
            }
        case let .failed(message):
            InlineMessage(text: message)
            Button("Try again") {
                advanced.phase = .idle
                Task { await loadIfNeeded() }
            }
            .buttonStyle(OutlineButtonStyle(compact: true))
        case .unavailable:
            EmptyView()
        case let .loaded(selection):
            if selection.options.servers.isEmpty {
                Text("No \(is4k ? "4K " : "")\(mediaType.arrName) server is set up for this yet.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textMuted)
            } else {
                pickers(selection)
            }
        }
    }

    private var selection: Binding<AddOptionsSelection> {
        Binding(
            get: { advanced.selection ?? AddOptionsSelection(API.AddOptions(mediaType: mediaType, tmdbId: tmdbId, is4k: is4k, isAnime: false, servers: [])) },
            set: { advanced.selection = $0 }
        )
    }

    @ViewBuilder
    private func pickers(_ current: AddOptionsSelection) -> some View {
        Picker("Server", selection: Binding(
            get: { current.serverId ?? "" },
            set: { selection.wrappedValue.selectServer($0) }
        )) {
            ForEach(current.options.servers) { server in
                Text(server.pickerLabel).tag(server.id)
            }
        }
        if let server = current.server, !server.reachable {
            Text("This server isn't responding, so its lists can't be shown. It will use its saved choices.")
                .font(.system(size: 11.5))
                .foregroundStyle(Theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            if !current.qualityProfileChoices.isEmpty {
                Picker("Quality profile", selection: selection.qualityProfileId) {
                    ForEach(current.qualityProfileChoices) { profile in
                        Text(profile.name).tag(Optional(profile.id))
                    }
                }
            }
            if !current.rootFolderChoices.isEmpty {
                Picker("Root folder", selection: selection.rootFolderPath) {
                    ForEach(current.rootFolderChoices, id: \.self) { path in
                        Text(path).tag(Optional(path))
                    }
                }
            }
            tagsField(current)
        }
        if current.isTV {
            Picker("Series type", selection: selection.seriesType) {
                ForEach(API.SeriesType.knownCases, id: \.self) { type in
                    Text(type.label).tag(Optional(type))
                }
            }
        }
    }

    @ViewBuilder
    private func tagsField(_ current: AddOptionsSelection) -> some View {
        let available = current.server?.tags ?? []
        if !available.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text("Tags")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textSecondary)
                FlowLayout(spacing: 12, lineSpacing: 6) {
                    ForEach(available) { tag in
                        Toggle(tag.label, isOn: Binding(
                            get: { current.tags.contains(tag.id) },
                            set: { selection.wrappedValue.setTag(tag.id, on: $0) }
                        ))
                        .toggleStyle(.checkbox)
                        .font(.system(size: 12))
                    }
                }
            }
        }
    }

    private func loadIfNeeded() async {
        guard advanced.isExpanded, advanced.phase == .idle else { return }
        advanced.phase = .loading
        let api = model.api
        let result: Result<API.AddOptions, any Error>
        do {
            result = .success(try await api.titles.addOptions(mediaType, id: tmdbId, is4k: is4k))
        } catch {
            result = .failure(error)
        }
        if Task.isCancelled {
            if advanced.phase == .loading { advanced.phase = .idle }
            return
        }
        advanced.finishLoading(result)
    }
}
