import SwiftUI

/// app/discover/[list]/page.tsx — a Discover shelf's "See all": the whole
/// list as an infinite grid (`GET /discover/lists/{list}`).
struct DiscoverListView: View {
    let list: API.DiscoverList

    @Environment(AppModel.self) private var model

    /// The server's name for the list, once a page has arrived.
    @State private var title: String?
    @State private var cards: [API.TitleCard] = []
    @State private var nextPage = 1
    @State private var hasNextPage = true
    @State private var loadingPage = false
    @State private var initialLoad = true
    @State private var error: APIError?
    /// A later page failed. Paging pauses (so scrolling doesn't hammer the
    /// server) until the Retry row at the bottom asks again.
    @State private var pageError: APIError?
    @State private var generation = 0

    private var heading: String { title ?? list.label }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                Text(heading)
                    .font(.marqueeDisplay(30))
                    .foregroundStyle(Theme.textPrimary)
                    .accessibilityAddTraits(.isHeader)

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
        .task(id: DiscoverListKey(
            list: list,
            revision: model.events.remoteRevision(of: .library) &+ model.events.revision(of: .catalog),
            reload: model.reloadToken
        )) {
            await reset()
        }
    }

    // MARK: Results (infinite-results-grid.tsx)

    @ViewBuilder
    private var results: some View {
        if initialLoad && cards.isEmpty && error == nil {
            LoadingView()
        } else if let error, cards.isEmpty {
            EmptyStateView(
                title: "Couldn't load \(heading)",
                message: error.localizedDescription,
                systemImage: "exclamationmark.triangle",
                actionTitle: "Try again",
                action: { model.reload() }
            )
        } else if cards.isEmpty {
            EmptyStateView(
                title: "Nothing here right now",
                systemImage: "sparkle.magnifyingglass"
            )
        } else {
            PosterGrid {
                ForEach(cards) { card in
                    PosterCard(card: card, showsTypeLabel: list.mixesMediaTypes) {
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
        error = nil
        pageError = nil

        await loadNextPage()
        if current == generation { initialLoad = false }
    }

    /// Appends the next page. After a failure only an explicit retry asks
    /// again; the cards already loaded (and the scroll offset) stay put.
    private func loadNextPage(retrying: Bool = false) async {
        guard hasNextPage, !loadingPage, retrying || pageError == nil else { return }
        let current = generation
        loadingPage = true
        defer { if current == generation { loadingPage = false } }

        // Rankings shift between requests and upcoming-movies drops
        // re-releases, so a page can add nothing new — keep going (bounded)
        // so scrolling never dead-ends.
        var attempts = 0
        var appended = 0
        repeat {
            do {
                let page = try await model.api.discover.list(list, page: nextPage)
                guard current == generation else { return }
                title = page.title.nonBlank ?? title
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
}

private struct DiscoverListKey: Hashable {
    let list: API.DiscoverList
    let revision: Int
    let reload: Int
}
