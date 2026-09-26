import SwiftUI

/// app/discover/page.tsx — curated shelves, all from `GET /discover`.
struct DiscoverView: View {
    @Environment(AppModel.self) private var model

    @State private var shelves: API.DiscoverShelves?
    @State private var loading = true
    @State private var error: APIError?

    var body: some View {
        ScrollView {
            // .page{padding:28px 0 28px 28px} — the shelves bleed off the
            // right edge, so only the states that centre themselves get the
            // right gutter back.
            VStack(alignment: .leading, spacing: Metrics.shelfSpacing) {
                if let error, error.isTMDbUnconfigured {
                    TMDbMissingNotice(isAdmin: model.viewer?.isAdmin == true) {
                        model.openSettings(.integrations)
                    }
                    .padding(.trailing, Metrics.pagePadding)
                } else if let shelves {
                    content(shelves)
                } else if loading {
                    LoadingView(label: "Loading Discover…")
                        .padding(.trailing, Metrics.pagePadding)
                } else if let error {
                    EmptyStateView(
                        title: "Couldn't load Discover",
                        message: error.localizedDescription,
                        systemImage: "wifi.exclamationmark",
                        actionTitle: "Try again",
                        action: { model.reload() }
                    )
                    .padding(.top, 60)
                    .padding(.trailing, Metrics.pagePadding)
                }
            }
            .padding(.leading, Metrics.pagePadding)
            .padding(.vertical, Metrics.pagePadding)
        }
        .scrollsUnderNavRail()
        .marqueeGlow()
        .background(Theme.bg0)
        .navigationTitle("Discover")
        .task(id: ReloadKey(
            token: model.reloadToken,
            remote: model.events.remoteRevision(of: .library),
            local: model.events.revision(of: .settings)
        )) {
            await load()
        }
    }

    private func load() async {
        loading = shelves == nil
        do {
            let fresh = try await model.api.discover.shelves()
            if Task.isCancelled { return }
            shelves = fresh
            error = nil
        } catch let failure as APIError {
            if failure.isCancellation { return }
            error = failure
            if failure.isTMDbUnconfigured { shelves = nil }
        } catch {
            self.error = APIError.wrapping(error)
        }
        loading = false
    }

    /// The rows in the admin's order (`shelves`, 0.49+), or the fixed keys
    /// in their usual order from an older server; see `DiscoverLayout`.
    @ViewBuilder
    private func content(_ shelves: API.DiscoverShelves) -> some View {
        let layout = DiscoverLayout(shelves)
        if layout.isEmpty {
            EmptyStateView(
                title: "Nothing to show yet",
                message: "Your server couldn't get anything back from TMDb. Check its internet connection or the TMDb credential in Settings → Integrations, then reload (⌘R).",
                systemImage: "wifi.exclamationmark"
            )
            .padding(.trailing, Metrics.pagePadding)
        }

        ForEach(layout.rows) { row in
            self.row(row, showsColorKey: row.id == layout.colorKeyRowID)
        }
    }

    @ViewBuilder
    private func row(_ row: DiscoverLayout.Row, showsColorKey: Bool) -> some View {
        let seeAll = seeAll(row.seeAll)
        switch row.content {
        case let .posters(cards):
            posterShelf(row.title, cards, seeAll: seeAll, showsColorKey: showsColorKey)
        case let .genres(tiles, mediaType):
            genreShelf(row.title, tiles, mediaType: mediaType, seeAll: seeAll)
        case let .studios(studios):
            Shelf(title: row.title, seeAll: seeAll) {
                ForEach(studios) { studio in
                    LogoCard(name: studio.name, logoPath: studio.logoPath) {
                        model.open(.company(studio.tmdbId))
                    }
                }
            }
        case let .networks(networks):
            Shelf(title: row.title, seeAll: seeAll) {
                ForEach(networks) { network in
                    LogoCard(name: network.name, logoPath: network.logoPath) {
                        model.browse(.tv, networkId: network.tmdbId)
                    }
                }
            }
        }
    }

    /// What a row's "See all" chevron does; nil hides it.
    private func seeAll(_ destination: API.SeeAllDestination?) -> (() -> Void)? {
        switch destination {
        case let .list(list): return { model.open(.discoverList(list)) }
        case let .browse(mediaType): return { model.browse(mediaType) }
        case nil: return nil
        }
    }

    /// Every Discover row carries the MOVIE/SERIES pill, like the web page.
    private func posterShelf(
        _ title: String,
        _ cards: [API.TitleCard],
        seeAll: (() -> Void)? = nil,
        showsColorKey: Bool = false
    ) -> some View {
        Shelf(title: title, seeAll: seeAll, trailing: showsColorKey ? AnyView(StatusColorKey()) : nil) {
            ForEach(cards) { card in
                ShelfItem {
                    PosterCard(card: card, showsTypeLabel: true) {
                        model.openTitle(card.id)
                    }
                }
            }
        }
    }

    private func genreShelf(_ title: String, _ tiles: [API.GenreTile], mediaType: API.MediaType, seeAll: (() -> Void)?) -> some View {
        // `.row{gap:16px}` on the genre row.
        Shelf(title: title, seeAll: seeAll, itemGap: Metrics.tileGap) {
            ForEach(Array(tiles.enumerated()), id: \.element.id) { index, tile in
                GenreCard(tile: tile, index: index) {
                    model.browse(mediaType, genreId: tile.id)
                }
            }
        }
    }
}

/// The `.task(id:)` key a screen reloads on.
///
/// - `token`: ⌘R.
/// - `remote`: `events.remoteRevision(of:)` — the server moved on its own.
/// - `local`: `events.revision(of:)` — include an area here only when the
///   screen's own list genuinely has to rebuild after the viewer acts on it
///   (Favorites losing a card, the request queue losing a row). Leaving it out
///   is what keeps a screen from re-fetching, and re-scrolling, under the
///   viewer who just pressed a button on it.
struct ReloadKey: Hashable {
    var token: Int
    var remote: Int = 0
    var local: Int = 0
}

struct TMDbMissingNotice: View {
    let isAdmin: Bool
    let openSettings: () -> Void

    var body: some View {
        EmptyStateView(
            title: "Connect TMDb to start browsing",
            message: isAdmin
                ? "Every poster, search result, and title page comes from TMDb. Add a free API key or read access token in Settings → Integrations."
                : "The household admin hasn't connected TMDb yet.",
            systemImage: "film.stack",
            actionTitle: isAdmin ? "Open Settings" : nil,
            action: isAdmin ? openSettings : nil
        )
        .padding(.top, 60)
    }
}
