import SwiftUI

/// app/library/page.tsx — everything the household owns, in four tabs: All
/// titles (filtered, paged), Missing from collections, the admin's
/// Duplicates, and Storage.
struct LibraryView: View {
    @Environment(AppModel.self) private var model
    @State private var screen = LibraryModel()
    @AppStorage("marquee.library.layout") private var layout: LibraryModel.Layout = .grid

    private var isAdmin: Bool { model.viewer?.isAdmin == true }

    private var tabs: [LibraryModel.Tab] {
        LibraryModel.Tab.allCases.filter { $0 != .duplicates || isAdmin }
    }

    var body: some View {
        @Bindable var screen = screen
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                Text("Library")
                    .font(.marqueeDisplay(32))
                    .foregroundStyle(Theme.textPrimary)

                if screen.unsupported {
                    EmptyStateView(
                        title: String(localized: "Library"),
                        message: String(localized: "This server doesn't have a Library page yet. Update it to Marquee 0.51 or later."),
                        systemImage: "books.vertical",
                        actionTitle: String(localized: "Try again"),
                        action: { model.reload() }
                    )
                } else {
                    Picker("Library sections", selection: $screen.tab) {
                        ForEach(tabs) { tab in
                            Text(tab.label).tag(tab)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .fixedSize()

                    switch screen.tab {
                    case .all:
                        LibraryAllTitlesTab(screen: screen, layout: $layout)
                    case .collections:
                        LibraryCollectionsTab(screen: screen)
                    case .duplicates:
                        LibraryDuplicatesTab(screen: screen)
                    case .storage:
                        LibraryStorageTab(screen: screen)
                    }
                }
            }
            .padding(Metrics.pagePadding)
            .frame(maxWidth: 1240, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .scrollsUnderNavRail()
        .background(Theme.bg0)
        .navigationTitle("Library")
        .onAppear { screen.attach(model.api) }
        // The All titles list starts over with its filters, ⌘R, and when
        // the server's library changes.
        .task(id: AllTitlesKey(query: screen.query, reload: model.reloadToken, remote: model.events.remoteRevision(of: .library))) {
            screen.attach(model.api)
            await screen.reset()
        }
        // The other tabs load when first shown, and again after ⌘R or a
        // library change once they're shown again.
        .task(id: SectionKey(tab: screen.tab, reload: model.reloadToken, remote: model.events.remoteRevision(of: .library))) {
            screen.attach(model.api)
            await screen.loadSectionIfNeeded(
                at: LibraryModel.SectionRevision(reload: model.reloadToken, remote: model.events.remoteRevision(of: .library))
            )
        }
        .onChange(of: isAdmin) {
            if screen.tab == .duplicates, !isAdmin { screen.tab = .all }
        }
    }
}

private struct AllTitlesKey: Hashable {
    let query: API.LibraryQuery
    let reload: Int
    let remote: Int
}

private struct SectionKey: Hashable {
    let tab: LibraryModel.Tab
    let reload: Int
    let remote: Int
}

// MARK: - All titles

private struct LibraryAllTitlesTab: View {
    let screen: LibraryModel
    @Binding var layout: LibraryModel.Layout

    @Environment(AppModel.self) private var model
    @State private var searchText = ""
    @State private var searchDebounce: Task<Void, Never>?

    private var isAdmin: Bool { model.viewer?.isAdmin == true }

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            if screen.connected == false {
                notConnected
            } else {
                if let summary = screen.summary {
                    countsCard(summary)
                }
                filterBar
                results
            }
        }
        .onAppear { searchText = screen.query.q }
        .onChange(of: screen.query.q) { _, value in
            if value != searchText { searchText = value }
        }
    }

    private var notConnected: some View {
        EmptyStateView(
            title: String(localized: "Library"),
            message: isAdmin
                ? String(localized: "Connect Plex, Jellyfin, Sonarr or Radarr to see everything you already own in one place.")
                : String(localized: "The household admin hasn't connected Plex, Jellyfin, Sonarr or Radarr yet."),
            systemImage: "books.vertical",
            actionTitle: isAdmin ? String(localized: "Connect an integration") : nil,
            action: isAdmin ? { model.openSettings(.mediaServers) } : nil
        )
    }

    private func countsCard(_ summary: API.LibrarySummary) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(summary.line)
                .font(.system(size: 13))
                .foregroundStyle(Theme.textPrimary)
            if let note = summary.trackedNote {
                Text(note)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.bg1, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Theme.border))
    }

    // MARK: Filters (library-filters.tsx)

    private var filterBar: some View {
        @Bindable var screen = screen
        let filters = screen.filters
        return FlowLayout(spacing: 10, lineSpacing: 10) {
            TextField("Search these titles…", text: $searchText)
                .textFieldStyle(.roundedBorder)
                .frame(width: 200)
                .onChange(of: searchText) { _, value in
                    searchDebounce?.cancel()
                    searchDebounce = Task {
                        try? await Task.sleep(for: .milliseconds(350))
                        guard !Task.isCancelled else { return }
                        if screen.query.q != value { screen.query.q = value }
                    }
                }
                .onSubmit {
                    searchDebounce?.cancel()
                    screen.query.q = searchText
                }

            Picker("Type", selection: $screen.query.type) {
                Text("Movies and series").tag(API.MediaType?.none)
                Divider()
                Text("Movies").tag(API.MediaType?.some(.movie))
                Text("Series").tag(API.MediaType?.some(.tv))
            }
            .labelsHidden()
            .fixedSize()

            Picker("Status", selection: $screen.query.status) {
                Text("Any status").tag(API.LibraryStatus?.none)
                Divider()
                ForEach(API.LibraryStatus.knownCases.filter { $0 != .untracked }, id: \.rawValue) { status in
                    Text(status.name).tag(API.LibraryStatus?.some(status))
                }
            }
            .labelsHidden()
            .fixedSize()

            if !filters.sources.isEmpty {
                Picker("Source", selection: $screen.query.source) {
                    Text("Any source").tag(API.LibraryProvider?.none)
                    Divider()
                    ForEach(filters.sources, id: \.rawValue) { source in
                        Text(source.displayName).tag(API.LibraryProvider?.some(source))
                    }
                }
                .labelsHidden()
                .fixedSize()
            }

            if !filters.resolutions.isEmpty {
                Picker("Resolution", selection: $screen.query.resolution) {
                    Text("Any resolution").tag(API.LibraryResolution?.none)
                    Divider()
                    ForEach(filters.resolutions, id: \.rawValue) { resolution in
                        Text(resolution.label).tag(API.LibraryResolution?.some(resolution))
                    }
                }
                .labelsHidden()
                .fixedSize()
            }

            if filters.hasHdr {
                Button {
                    screen.query.hdr.toggle()
                } label: {
                    Label(String(localized: "HDR only"), systemImage: screen.query.hdr ? "checkmark" : "sparkles")
                }
                .buttonStyle(OutlineButtonStyle(tint: screen.query.hdr ? Theme.accent : nil, compact: true))
                .help(String(localized: "Only files with HDR or Dolby Vision"))
            }

            if !filters.codecs.isEmpty {
                Picker("Codec", selection: $screen.query.codec) {
                    Text("Any codec").tag(String?.none)
                    Divider()
                    ForEach(filters.codecs, id: \.self) { codec in
                        Text(codec).tag(String?.some(codec))
                    }
                }
                .labelsHidden()
                .fixedSize()
            }

            if !filters.genres.isEmpty {
                Picker("Genre", selection: $screen.query.genre) {
                    Text("All genres").tag(String?.none)
                    Divider()
                    ForEach(filters.genres, id: \.self) { genre in
                        Text(genre).tag(String?.some(genre))
                    }
                }
                .labelsHidden()
                .fixedSize()
            }

            if !filters.years.isEmpty {
                Picker("Year", selection: $screen.query.year) {
                    Text("All years").tag(Int?.none)
                    Divider()
                    ForEach(filters.years, id: \.self) { year in
                        Text(String(year)).tag(Int?.some(year))
                    }
                }
                .labelsHidden()
                .fixedSize()
            }

            Picker("Sort", selection: $screen.query.sort) {
                ForEach(API.LibrarySort.allCases) { sort in
                    Text(sort.label).tag(sort)
                }
            }
            .labelsHidden()
            .fixedSize()

            Picker("Layout", selection: $layout) {
                Image(systemName: "square.grid.2x2").tag(LibraryModel.Layout.grid)
                    .help("Grid")
                Image(systemName: "list.bullet").tag(LibraryModel.Layout.table)
                    .help("Table")
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .fixedSize()

            if layout == .grid {
                StatusColorKey()
            }

            if screen.query.hasFilters {
                Button("Clear filters") {
                    searchDebounce?.cancel()
                    searchText = ""
                    screen.clearFilters()
                }
                .buttonStyle(OutlineButtonStyle(compact: true))
            }
        }
    }

    // MARK: Results (library-results.tsx)

    @ViewBuilder
    private var results: some View {
        if screen.initialLoad && screen.entries.isEmpty && screen.error == nil {
            LoadingView()
        } else if let error = screen.error, screen.entries.isEmpty {
            EmptyStateView(
                title: String(localized: "Couldn't load your library"),
                message: error.localizedDescription,
                systemImage: "exclamationmark.triangle",
                actionTitle: String(localized: "Try again"),
                action: { model.reload() }
            )
        } else if screen.entries.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                if screen.isEmptyWithFilters {
                    Text("No titles match these filters.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textMuted)
                } else {
                    Text(isAdmin
                        ? String(localized: "Still syncing your library — check back in a moment, or review your integrations.")
                        : String(localized: "Still syncing — check back in a moment."))
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textMuted)
                    if isAdmin {
                        Button(String(localized: "Review integrations")) { model.openSettings(.mediaServers) }
                            .buttonStyle(OutlineButtonStyle(compact: true))
                    }
                }
            }
            .padding(.vertical, 24)
        } else {
            if layout == .grid {
                grid
            } else {
                table
            }
            if screen.hasNextPage {
                HStack(spacing: 8) {
                    Spacer()
                    if screen.loadingPage {
                        ProgressView().controlSize(.small)
                        Text("Loading more…").font(.system(size: 12)).foregroundStyle(Theme.textMuted)
                    } else if let pageError = screen.pageError {
                        InlineMessage(text: String(localized: "Couldn't load more"))
                            .help(pageError.localizedDescription)
                        Button("Retry") {
                            Task { await screen.loadNextPage(retrying: true) }
                        }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                    }
                    Spacer()
                }
                .frame(height: 60)
                .onAppear { Task { await screen.loadNextPage() } }
            }
        }
    }

    private var grid: some View {
        PosterGrid {
            ForEach(screen.entries) { entry in
                PosterCard(card: entry.card) { model.openTitle(entry.id) }
                    .help(entry.metaLine)
                    .onAppear {
                        if entry.id == screen.entries.last?.id { Task { await screen.loadNextPage() } }
                    }
            }
        }
    }

    private var table: some View {
        let rows = screen.entries
        return Table(rows) {
            TableColumn("Title") { entry in
                Button(entry.name) { model.openTitle(entry.id) }
                    .buttonStyle(QuietButtonStyle(color: Theme.textPrimary))
                    .onAppear {
                        if entry.id == rows.last?.id { Task { await screen.loadNextPage() } }
                    }
            }
            .width(min: 180, ideal: 300)
            TableColumn("Year") { entry in
                Text(entry.year ?? "—").foregroundStyle(Theme.textSecondary)
            }
            .width(56)
            TableColumn("Quality") { entry in
                LibraryQualityCell(entry: entry)
            }
            .width(min: 120, ideal: 220)
            TableColumn("Size") { entry in
                Text(entry.sizeLabel ?? "—").foregroundStyle(Theme.textSecondary)
            }
            .width(min: 60, ideal: 80)
            TableColumn("Status") { entry in
                if let status = entry.status {
                    StatusBadge(status: status, compact: true)
                } else {
                    Text("—").foregroundStyle(Theme.textMuted)
                }
            }
            .width(min: 90, ideal: 130)
            TableColumn("Source") { entry in
                Text(entry.source.displayName).foregroundStyle(Theme.textSecondary)
            }
            .width(min: 60, ideal: 80)
            TableColumn("Location") { entry in
                if let path = entry.filePath.nonBlank {
                    Text(path)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(Theme.textSecondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .help(path)
                } else {
                    Text("—").foregroundStyle(Theme.textMuted)
                }
            }
            .width(min: isAdmin ? 160 : 0, ideal: isAdmin ? 280 : 0, max: isAdmin ? nil : 0)
            TableColumn("Actions") { entry in
                LibraryRowActions(screen: screen, entry: entry)
            }
            .width(min: isAdmin ? 220 : 0, ideal: isAdmin ? 300 : 0, max: isAdmin ? nil : 0)
        }
        .frame(minHeight: CGFloat(min(rows.count, 18)) * 30 + 40)
        .scrollContentBackground(.hidden)
        .background(Theme.bg1, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.border))
    }
}

/// The table's Quality cell: the 4K / HDR / codec / audio chips, then
/// "Upgrade available" when Radarr says the file is below the cutoff.
private struct LibraryQualityCell: View {
    let entry: API.LibraryEntry

    var body: some View {
        HStack(spacing: 4) {
            if let resolution = entry.resolution, resolution.isKnown {
                TonePill(text: resolution.label, tone: resolution == .uhd ? .accent : .neutral, small: true)
            }
            if let hdr = entry.hdr.nonBlank {
                TonePill(text: hdr == "Dolby Vision" ? "DV" : hdr, tone: .owned, small: true)
            }
            if let codec = entry.videoCodec.nonBlank {
                TonePill(text: codec, tone: .neutral, small: true)
            }
            if let audio = Quality.audioLabel(entry.audioCodec) {
                TonePill(text: audio, tone: .info, small: true)
            }
            if entry.upgradeAvailable {
                Text("Upgrade available")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.info)
            }
            if entry.qualityLabel == nil, !entry.upgradeAvailable {
                Text("—").foregroundStyle(Theme.textMuted)
            }
        }
    }
}

/// The admin's Sonarr/Radarr actions on a row (library-arr-actions.tsx):
/// "Search now" and "Stop/Start monitoring", with what went wrong beneath.
private struct LibraryRowActions: View {
    let screen: LibraryModel
    let entry: API.LibraryEntry

    var body: some View {
        if let tracking = entry.arrTracking {
            let busy = screen.busyRows.contains(entry.id)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Button(String(localized: "Search now")) {
                        Task { await screen.searchNow(entry) }
                    }
                    .buttonStyle(OutlineButtonStyle(compact: true))
                    .disabled(busy)
                    Button(tracking.monitored ? String(localized: "Stop monitoring") : String(localized: "Start monitoring")) {
                        Task { await screen.toggleMonitoring(entry) }
                    }
                    .buttonStyle(OutlineButtonStyle(compact: true))
                    .disabled(busy)
                }
                if let message = screen.rowMessages[entry.id] {
                    Text(message.text)
                        .font(.system(size: 10.5))
                        .foregroundStyle(message.isError ? Theme.danger : Theme.owned)
                        .lineLimit(2)
                }
            }
        } else {
            Text("—").foregroundStyle(Theme.textMuted)
        }
    }
}

// MARK: - Missing from collections

private struct LibraryCollectionsTab: View {
    let screen: LibraryModel

    @Environment(AppModel.self) private var model

    var body: some View {
        if let collections = screen.collections {
            if collections.isEmpty {
                Text("Nothing incomplete — every franchise you own part of is fully owned, or none of your titles belongs to one yet.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textMuted)
                    .padding(.vertical, 24)
            } else {
                VStack(alignment: .leading, spacing: 40) {
                    ForEach(collections) { collection in
                        LibraryCollectionSection(screen: screen, collection: collection)
                    }
                }
            }
        } else if let error = screen.collectionsError {
            EmptyStateView(
                title: String(localized: "Couldn't load your library"),
                message: error,
                systemImage: "exclamationmark.triangle",
                actionTitle: String(localized: "Try again"),
                action: { model.reload() }
            )
        } else {
            LoadingView()
        }
    }
}

/// One franchise: its heading with "Add all N missing" (the admin) or
/// "Request all N missing" (a member), then every part — the title page's
/// franchise row.
private struct LibraryCollectionSection: View {
    let screen: LibraryModel
    let collection: API.LibraryCollection

    @Environment(AppModel.self) private var model
    @State private var confirmingAddAll = false
    @State private var confirmingRequestAll = false

    var body: some View {
        let addCount = collection.addAllMissing.count
        let requestCount = collection.requestAllMissing.count
        let busy = screen.busyCollections.contains(collection.key)
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                SectionTitle(text: collection.heading)
                if let collectionId = collection.collectionId, let favorited = collection.collectionFavorited {
                    FavoriteButton(target: FavoriteTarget(.collection, collectionId, favorited: favorited))
                }
                if let result = screen.collectionResults[collection.key] {
                    Text(result)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textSecondary)
                } else if addCount > 0 {
                    Button(busy ? String(localized: "Adding…") : String(localized: "Add all \(addCount) missing")) { confirmingAddAll = true }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                        .disabled(busy)
                } else if requestCount > 0 {
                    Button(busy ? String(localized: "Requesting…") : String(localized: "Request all \(requestCount) missing")) { confirmingRequestAll = true }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                        .disabled(busy)
                }
            }
            PosterGrid {
                ForEach(collection.items) { card in
                    PosterCard(card: card) { model.openTitle(card.id) }
                }
            }
        }
        .confirmationDialog(
            "Add all \(addCount) missing titles to Sonarr/Radarr?",
            isPresented: $confirmingAddAll
        ) {
            Button("Add All") { Task { await screen.addAllMissing(collection) } }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog(
            "Request all \(requestCount) missing titles?",
            isPresented: $confirmingRequestAll
        ) {
            Button("Request All") { Task { await screen.requestAllMissing(collection) } }
            Button("Cancel", role: .cancel) {}
        }
    }
}

// MARK: - Duplicates (library-duplicates.tsx)

private struct LibraryDuplicatesTab: View {
    let screen: LibraryModel

    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Titles with more than one file, or listed by two Plex or two Jellyfin servers. The same file seen through different folder mappings (like /movies and /data/Movies) doesn't count. Check the paths before deleting anything — Marquee deletes nothing itself.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            if let duplicates = screen.duplicates {
                if duplicates.isEmpty {
                    Text("No duplicates — every title is on one server, in one file.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textMuted)
                        .padding(.vertical, 12)
                } else {
                    ForEach(duplicates) { group in
                        LibraryDuplicateGroup(group: group)
                    }
                }
            } else if let error = screen.duplicatesError {
                EmptyStateView(
                    title: String(localized: "Couldn't load your library"),
                    message: error,
                    systemImage: "exclamationmark.triangle",
                    actionTitle: String(localized: "Try again"),
                    action: { model.reload() }
                )
            } else {
                LoadingView()
            }
        }
    }
}

private struct LibraryDuplicateGroup: View {
    let group: API.LibraryDuplicate

    @Environment(AppModel.self) private var model

    private struct CopyRow: Identifiable {
        let id: Int
        let copy: API.LibraryCopy
    }

    var body: some View {
        let rows = group.copies.enumerated().map { CopyRow(id: $0.offset, copy: $0.element) }
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Button(group.name) { model.openTitle(group.id) }
                    .buttonStyle(QuietButtonStyle(color: Theme.textPrimary))
                    .font(.system(size: 15, weight: .medium))
                if let year = group.year.nonBlank {
                    Text(year)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textSecondary)
                }
                if group.reason.isKnown {
                    TonePill(text: group.reason.label, tone: .missing, small: true)
                }
            }
            Table(rows) {
                TableColumn("Server") { row in
                    VStack(alignment: .leading, spacing: 1) {
                        Text(row.copy.server).foregroundStyle(Theme.textPrimary)
                        Text(row.copy.source.displayName)
                            .font(.system(size: 10.5))
                            .foregroundStyle(Theme.textMuted)
                    }
                }
                .width(min: 100, ideal: 140)
                TableColumn("Location") { row in
                    if let path = row.copy.filePath.nonBlank {
                        Text(path)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(Theme.textSecondary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .help(path)
                    } else {
                        Text("—").foregroundStyle(Theme.textMuted)
                    }
                }
                .width(min: 200, ideal: 420)
                TableColumn("Size") { row in
                    Text(row.copy.sizeBytes.map { Format.bytes($0) } ?? "—").foregroundStyle(Theme.textSecondary)
                }
                .width(min: 60, ideal: 80)
                TableColumn("Quality") { row in
                    Text(row.copy.quality.nonBlank ?? "—").foregroundStyle(Theme.textSecondary)
                }
                .width(min: 80, ideal: 120)
            }
            .frame(height: CGFloat(rows.count) * 36 + 40)
            .scrollContentBackground(.hidden)
            .background(Theme.bg1, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.border))
        }
    }
}

// MARK: - Storage (library-storage-card.tsx)

private struct LibraryStorageTab: View {
    let screen: LibraryModel

    @Environment(AppModel.self) private var model

    private var isAdmin: Bool { model.viewer?.isAdmin == true }

    var body: some View {
        if let storage = screen.storage {
            card(storage)
        } else if let error = screen.storageError {
            EmptyStateView(
                title: String(localized: "Storage"),
                message: error,
                systemImage: "exclamationmark.triangle",
                actionTitle: String(localized: "Try again"),
                action: { model.reload() }
            )
        } else {
            LoadingView()
        }
    }

    @ViewBuilder
    private func card(_ storage: API.LibraryStorage) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                SectionTitle(text: String(localized: "Storage"))
                Spacer()
                if !storage.isEmpty {
                    Text("\(Format.bytes(storage.totalFreeBytes)) free")
                        .font(.marqueeDisplay(24))
                        .foregroundStyle(Theme.textPrimary)
                }
            }

            if storage.isEmpty {
                Text(isAdmin
                    ? String(localized: "Connect Sonarr or Radarr to see free space per root folder here.")
                    : String(localized: "The household admin hasn't connected Sonarr or Radarr yet."))
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textSecondary)
                if isAdmin {
                    Button("Connect an integration") { model.openSettings(.services) }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                }
            } else {
                if !storage.folders.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(storage.folders) { folder in
                            HStack(alignment: .center, spacing: 16) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(folder.path)
                                        .font(.system(size: 12, design: .monospaced))
                                        .foregroundStyle(Theme.textPrimary)
                                        .lineLimit(1)
                                        .truncationMode(.middle)
                                        .help(folder.path)
                                    if !folder.servers.isEmpty {
                                        Text(folder.servers.joined(separator: " · "))
                                            .font(.system(size: 11))
                                            .foregroundStyle(Theme.textMuted)
                                    }
                                }
                                Spacer()
                                Text("\(Format.bytes(folder.freeBytes)) free")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.textSecondary)
                            }
                            .padding(.vertical, 10)
                            if folder.id != storage.folders.last?.id {
                                Divider().overlay(Theme.border)
                            }
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 4) {
                        Text(storage.forecastLine)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.textSecondary)
                        if let fullOn = storage.fullOnLine() {
                            Text(fullOn)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.textMuted)
                        }
                    }
                    if let measured = storage.measuredLine {
                        Text(measured)
                            .font(.system(size: 11.5))
                            .foregroundStyle(Theme.textMuted)
                    }
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 20)
        .frame(maxWidth: 720, alignment: .leading)
        .background(Theme.bg1, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Theme.border))
    }
}
