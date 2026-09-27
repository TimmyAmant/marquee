import SwiftUI

/// /search?q=&type= — one search section's See all (`GET /search/{section}`,
/// 0.54+): the whole list as an infinite grid, like DiscoverListView.
struct SearchSectionView: View {
    let query: String
    let section: API.SearchSectionName

    @Environment(AppModel.self) private var model

    @State private var items = SearchSectionItems()
    @State private var total: Int?
    @State private var nextPage = 1
    @State private var hasNextPage = true
    @State private var loadingPage = false
    @State private var initialLoad = true
    @State private var error: APIError?
    /// A later page failed: paging waits for the Retry row.
    @State private var pageError: APIError?
    @State private var generation = 0

    private var heading: String { String(localized: "\(section.title) for “\(query)”") }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                VStack(alignment: .leading, spacing: 6) {
                    Button {
                        model.open(.search(query))
                    } label: {
                        Text("← All results for “\(query)”")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.textMuted)
                    }
                    .buttonStyle(.plain)
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(heading)
                            .font(.marqueeDisplay(30))
                            .foregroundStyle(Theme.textPrimary)
                            .accessibilityAddTraits(.isHeader)
                        if let total { SearchCount(total: total) }
                        Spacer(minLength: 0)
                        if section == .movies || section == .series { StatusColorKey() }
                    }
                }

                if let error, error.isTMDbUnconfigured {
                    TMDbMissingNotice(isAdmin: model.viewer?.isAdmin == true) {
                        model.openSettings(.integrations)
                    }
                } else {
                    results
                }
            }
            .padding(Metrics.pagePadding)
        }
        .scrollsUnderNavRail()
        .marqueeGlow()
        .background(Theme.bg0)
        .navigationTitle(heading)
        .task(id: ReloadKey(token: model.reloadToken, remote: model.events.remoteRevision(of: [.library, .favorites]))) {
            await reset()
        }
    }

    @ViewBuilder
    private var results: some View {
        if initialLoad && items.isEmpty && error == nil {
            LoadingView(label: String(localized: "Searching…"))
        } else if let error, items.isEmpty {
            EmptyStateView(
                title: String(localized: "Couldn't search"),
                message: error.localizedDescription,
                systemImage: "exclamationmark.triangle",
                actionTitle: String(localized: "Try again"),
                action: { model.reload() }
            )
        } else if items.isEmpty {
            EmptyStateView(title: String(localized: "No results for “\(query)”."), systemImage: "magnifyingglass")
        } else {
            grid
            if hasNextPage {
                HStack(spacing: 8) {
                    Spacer()
                    if loadingPage {
                        ProgressView().controlSize(.small)
                        Text("Loading more…").font(.system(size: 12)).foregroundStyle(Theme.textMuted)
                    } else if let pageError {
                        InlineMessage(text: String(localized: "Couldn't load more"))
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
        }
    }

    @ViewBuilder
    private var grid: some View {
        switch section {
        case .movies, .series:
            PosterGrid {
                ForEach(items.titles) { card in
                    PosterCard(card: card) { model.openTitle(card.id) }
                }
            }
        case .people:
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 20, alignment: .top)], alignment: .leading, spacing: 24) {
                ForEach(items.people) { person in
                    SearchPersonTile(person: person) { model.open(.person(person.tmdbId)) }
                }
            }
        case .studios:
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 200), spacing: 16, alignment: .top)], alignment: .leading, spacing: 20) {
                ForEach(items.companies) { company in
                    SearchCompanyTile(company: company, width: nil) {
                        if company.isNetwork {
                            model.browse(.tv, networkId: company.tmdbId)
                        } else {
                            model.open(.company(company.tmdbId))
                        }
                    }
                }
            }
        }
    }

    private func reset() async {
        generation &+= 1
        initialLoad = true
        items = SearchSectionItems()
        nextPage = 1
        hasNextPage = true
        error = nil
        pageError = nil
        await loadNextPage()
        initialLoad = false
    }

    private func loadNextPage(retrying: Bool = false) async {
        guard hasNextPage, !loadingPage, retrying || pageError == nil else { return }
        let current = generation
        loadingPage = true
        defer { if current == generation { loadingPage = false } }
        do {
            let page = nextPage
            let loaded: (added: Int, more: Bool, total: Int)
            switch section {
            case .movies, .series:
                let result = try await model.api.search.titles(section, query: query, page: page)
                guard current == generation else { return }
                loaded = (items.append(titles: result.results), result.hasMorePages, result.totalResults)
            case .people:
                let result = try await model.api.search.people(query: query, page: page)
                guard current == generation else { return }
                loaded = (items.append(people: result.results), result.hasMorePages, result.totalResults)
            case .studios:
                let result = try await model.api.search.studios(query: query, page: page)
                guard current == generation else { return }
                loaded = (items.append(companies: result.results), result.hasMorePages, result.totalResults)
            }
            total = loaded.total
            hasNextPage = loaded.more
            nextPage = page + 1
            error = nil
            pageError = nil
        } catch let failure as APIError {
            guard current == generation, !failure.isCancellation else { return }
            if items.isEmpty { error = failure } else { pageError = failure }
        } catch {
            guard current == generation else { return }
            let failure = APIError.wrapping(error)
            if items.isEmpty { self.error = failure } else { pageError = failure }
        }
    }
}

/// A See all's cards so far, deduplicated as pages arrive (TMDb's order can
/// shift between pages). Pure; unit tested.
struct SearchSectionItems: Equatable {
    private(set) var titles: [API.TitleCard] = []
    private(set) var people: [API.PersonCard] = []
    private(set) var companies: [API.SearchCompanyCard] = []

    var isEmpty: Bool { titles.isEmpty && people.isEmpty && companies.isEmpty }

    /// Adds what's new; returns how many were.
    @discardableResult
    mutating func append(titles more: [API.TitleCard]) -> Int {
        let seen = Set(titles.map(\.id))
        let fresh = more.filter { !seen.contains($0.id) }
        titles.append(contentsOf: fresh)
        return fresh.count
    }

    @discardableResult
    mutating func append(people more: [API.PersonCard]) -> Int {
        let seen = Set(people.map(\.id))
        let fresh = more.filter { !seen.contains($0.id) }
        people.append(contentsOf: fresh)
        return fresh.count
    }

    @discardableResult
    mutating func append(companies more: [API.SearchCompanyCard]) -> Int {
        let seen = Set(companies.map(\.id))
        let fresh = more.filter { !seen.contains($0.id) }
        companies.append(contentsOf: fresh)
        return fresh.count
    }
}
