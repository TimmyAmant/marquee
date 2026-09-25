import SwiftUI

/// app/discover/discover-view.tsx — /movies and /series.
struct BrowseView: View {
    let mediaType: API.MediaType

    @Environment(AppModel.self) private var model
    @Environment(\.openSettings) private var openSettings

    @State private var extras: API.BrowseExtras?
    @State private var cards: [API.TitleCard] = []
    @State private var nextPage = 1
    @State private var hasNextPage = true
    @State private var loadingPage = false
    @State private var initialLoad = true
    @State private var error: APIError?
    /// A later page failed. Paging pauses (so scrolling doesn't hammer the
    /// server) until the Retry row at the bottom asks again.
    @State private var pageError: APIError?
    @State private var surprising = false
    @State private var surpriseError: String?
    @State private var generation = 0

    private var filters: API.BrowseQuery {
        mediaType == .movie ? model.movieFilters : model.seriesFilters
    }

    private func setFilters(_ update: (inout API.BrowseQuery) -> Void) {
        if mediaType == .movie {
            update(&model.movieFilters)
        } else {
            update(&model.seriesFilters)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                if let error, error.isTMDbUnconfigured {
                    TMDbMissingNotice(isAdmin: model.viewer?.isAdmin == true) {
                        model.settingsTab = .integrations
                        openSettings()
                    }
                    .padding(.trailing, Metrics.pagePadding)
                } else {
                    if let becauseYouWatched = extras?.becauseYouWatched, !becauseYouWatched.items.isEmpty {
                        Shelf(title: "Because you watched \(becauseYouWatched.title)") {
                            ForEach(becauseYouWatched.items) { card in
                                ShelfItem {
                                    PosterCard(card: card) { model.openTitle(card.id) }
                                }
                            }
                        }
                    }
                    // The shelf above bleeds off the right edge; the filters
                    // and the results grid keep the 28pt gutter.
                    filterBar
                        .padding(.trailing, Metrics.pagePadding)
                    results
                        .padding(.trailing, Metrics.pagePadding)
                }
            }
            .padding(.leading, Metrics.pagePadding)
            .padding(.vertical, Metrics.pagePadding)
        }
        .scrollsUnderNavRail()
        .marqueeGlow()
        .background(Theme.bg0)
        .navigationTitle(mediaType.pluralLabel)
        // `.catalog`, not all of `.settings`: saving a Discord webhook or an
        // ntfy topic changes nothing here and mustn't throw the grid back to
        // the top.
        .task(id: BrowseKey(filters: filters, revision: model.events.remoteRevision(of: .library) &+ model.events.revision(of: .catalog), reload: model.reloadToken)) {
            await reset()
        }
    }

    // MARK: Filters

    private var filterBar: some View {
        FlowLayout(spacing: 10, lineSpacing: 10) {
            Picker("Sort", selection: Binding(get: { filters.sort }, set: { value in setFilters { $0.sort = value } })) {
                ForEach(API.BrowseSort.allCases) { sort in
                    Text(sort.label).tag(sort)
                }
            }
            .labelsHidden()
            .fixedSize()

            if let genres = extras?.genres, !genres.isEmpty {
                Picker("Genre", selection: Binding(get: { filters.genreId }, set: { value in setFilters { $0.genreId = value } })) {
                    Text("All genres").tag(Int?.none)
                    Divider()
                    ForEach(genres) { genre in
                        Text(genre.name).tag(Int?.some(genre.id))
                    }
                }
                .labelsHidden()
                .fixedSize()
            }

            Picker("Year", selection: Binding(get: { filters.year }, set: { value in setFilters { $0.year = value } })) {
                Text("All years").tag(Int?.none)
                Divider()
                ForEach(Self.years, id: \.self) { year in
                    Text(String(year)).tag(Int?.some(year))
                }
            }
            .labelsHidden()
            .fixedSize()

            if mediaType == .tv, filters.networkId != nil {
                Button {
                    setFilters { $0.networkId = nil }
                } label: {
                    Text("\(extras?.network?.name ?? "Network") ✕")
                }
                .buttonStyle(OutlineButtonStyle(tint: Theme.accent, compact: true))
            }

            Button {
                setFilters { $0.hideOwned.toggle() }
            } label: {
                Text(filters.hideOwned ? "✓ Hiding titles you already track" : "Hide titles you already track")
            }
            .buttonStyle(OutlineButtonStyle(tint: filters.hideOwned ? Theme.accent : nil, compact: true))

            Button {
                surprise()
            } label: {
                Text(surprising ? "Picking…" : "🎲 Surprise me")
            }
            .buttonStyle(OutlineButtonStyle(compact: true))
            .disabled(surprising)

            if let surpriseError {
                Text(surpriseError)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.danger)
            }
        }
    }

    private static let years: [Int] = {
        let current = Calendar.current.component(.year, from: Date())
        return Array((1950...current).reversed())
    }()

    // MARK: Results (infinite-results-grid.tsx)

    @ViewBuilder
    private var results: some View {
        if initialLoad && cards.isEmpty && error == nil {
            LoadingView()
        } else if let error, cards.isEmpty {
            EmptyStateView(
                title: "Couldn't load \(mediaType.pluralLabel.lowercased())",
                message: error.localizedDescription,
                systemImage: "exclamationmark.triangle",
                actionTitle: "Try again",
                action: { model.reload() }
            )
        } else if cards.isEmpty {
            EmptyStateView(
                title: "Nothing left here",
                message: "Try a different genre or year, or turn off “Hide titles you already track”.",
                systemImage: "sparkle.magnifyingglass"
            )
        } else {
            PosterGrid {
                ForEach(cards) { card in
                    PosterCard(card: card, showsOverview: true, showsRating: true) {
                        model.openTitle(card.id)
                    }
                    .onAppear {
                        if card.id == cards.last?.id { Task { await loadNextPage() } }
                    }
                }
            }
            if hasNextPage {
                HStack(spacing: 8) {
                    Spacer()
                    if loadingPage {
                        ProgressView().controlSize(.small)
                        Text("Loading more…").font(.system(size: 12)).foregroundStyle(Theme.textMuted)
                    } else if let pageError {
                        InlineMessage(text: "Couldn't load more")
                            .help(pageError.localizedDescription)
                        Button("Retry") {
                            Task { await loadNextPage(retrying: true) }
                        }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                    }
                    Spacer()
                }
                .frame(height: 60)
                .onAppear { Task { await loadNextPage() } }
            }
            if let error {
                InlineMessage(text: error.localizedDescription)
            }
        }
    }

    private func reset() async {
        // Every reset starts a new generation; anything still in flight from
        // an older one discards its results instead of appending them.
        generation &+= 1
        let current = generation
        initialLoad = true
        cards = []
        nextPage = 1
        hasNextPage = true
        loadingPage = false
        extras = nil
        error = nil
        pageError = nil
        surpriseError = nil

        let requested = filters
        do {
            let fresh = try await model.api.browse.extras(mediaType, requested)
            guard current == generation else { return }
            extras = fresh
        } catch let failure as APIError {
            guard current == generation, !failure.isCancellation else { return }
            error = failure
            if failure.isTMDbUnconfigured {
                initialLoad = false
                return
            }
        } catch {
            guard current == generation else { return }
            self.error = APIError.wrapping(error)
        }

        await loadNextPage()
        if current == generation { initialLoad = false }
    }

    /// Appends the next page. After a failure only an explicit retry asks
    /// again; the cards already loaded (and the scroll offset) stay put.
    private func loadNextPage(retrying: Bool = false) async {
        guard hasNextPage, !loadingPage, retrying || pageError == nil else { return }
        let current = generation
        let requested = filters
        loadingPage = true
        defer { if current == generation { loadingPage = false } }

        // With "hide titles you already track" on, a whole batch can filter
        // down to nothing — keep going (bounded) so scrolling never dead-ends.
        var attempts = 0
        var appended = 0
        repeat {
            do {
                let page = try await model.api.browse.page(mediaType, requested, page: nextPage)
                guard current == generation else { return }
                // Popularity ranking shifts between requests — drop repeats.
                let seen = Set(cards.map(\.id))
                let fresh = page.results.filter { !seen.contains($0.id) }
                cards.append(contentsOf: fresh)
                appended += fresh.count
                hasNextPage = page.hasMorePages
                nextPage = page.page + 1
                error = nil
                pageError = nil
            } catch let failure as APIError {
                guard current == generation, !failure.isCancellation else { return }
                pageFailed(failure)
                return
            } catch {
                guard current == generation else { return }
                pageFailed(APIError.wrapping(error))
                return
            }
            attempts += 1
        } while appended == 0 && hasNextPage && attempts < 5
    }

    /// The first page failing is the page's error (the empty state offers
    /// "Try again"); a later one only pauses paging behind the Retry row.
    private func pageFailed(_ failure: APIError) {
        if cards.isEmpty {
            error = failure
        } else {
            pageError = failure
        }
    }

    private func surprise() {
        surprising = true
        surpriseError = nil
        let request = API.SurpriseRequest(
            type: mediaType == .movie ? .movie : .tv,
            genreId: filters.genreId,
            year: filters.year,
            hideOwned: filters.hideOwned
        )
        let api = model.api
        Task {
            do {
                model.openTitle(try await api.discover.surprise(request))
            } catch {
                surpriseError = error.localizedDescription
            }
            surprising = false
        }
    }
}

private struct BrowseKey: Hashable {
    let filters: API.BrowseQuery
    let revision: Int
    let reload: Int
}
