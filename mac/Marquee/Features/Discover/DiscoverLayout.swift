import Foundation

/// What the Discover page shows, row by row, apart from the view so it's
/// testable: the server's `shelves` in the admin's order (0.49+), or the
/// fixed keys in their usual order from an older server. Empty rows and rows
/// this app can't draw are left out.
struct DiscoverLayout: Hashable, Sendable {
    struct Row: Hashable, Sendable, Identifiable {
        enum Content: Hashable, Sendable {
            /// Poster cards with their library status.
            case posters([API.TitleCard])
            /// Genre tiles to the Movies (`movie`) or Series (`tv`) grid.
            case genres([API.GenreTile], API.MediaType)
            /// Studio logos, each to its company page.
            case studios([API.NetworkCard])
            /// Network logos, each to the Series grid for that network.
            case networks([API.NetworkCard])

            var isEmpty: Bool {
                switch self {
                case let .posters(cards): return cards.isEmpty
                case let .genres(tiles, _): return tiles.isEmpty
                case let .studios(logos), let .networks(logos): return logos.isEmpty
                }
            }

            var isPosters: Bool {
                if case .posters = self { return true }
                return false
            }
        }

        /// The built-in row's key or a custom row's id.
        let id: String
        let title: String
        let content: Content
        let seeAll: API.SeeAllDestination?
    }

    let rows: [Row]

    /// The first poster row, which carries the "Color key" pill.
    var colorKeyRowID: String? { rows.first { $0.content.isPosters }?.id }

    var isEmpty: Bool { rows.isEmpty }

    init(rows: [Row]) {
        self.rows = rows
    }

    init(_ shelves: API.DiscoverShelves) {
        let all = shelves.shelves.map { $0.compactMap(Self.row) } ?? Self.fixedRows(shelves)
        rows = all.filter { !$0.content.isEmpty }
    }

    /// One `shelves` entry as a row: `results` is a poster row whatever the
    /// kind; `genres` and `logos` only for the kinds that have them. Anything
    /// else (a kind this app doesn't know, without `results`) is skipped.
    static func row(_ shelf: API.DiscoverRow) -> Row? {
        let seeAll = API.SeeAllDestination.resolve(shelf.seeAll, customRows: true)
        if let results = shelf.results {
            return Row(id: shelf.id, title: shelf.title, content: .posters(results), seeAll: seeAll)
        }
        let content: Row.Content
        switch (API.DiscoverShelf(rawValue: shelf.kind), shelf.genres, shelf.logos) {
        case let (.movieGenres, tiles?, _): content = .genres(tiles, .movie)
        case let (.seriesGenres, tiles?, _): content = .genres(tiles, .tv)
        case let (.studios, _, logos?): content = .studios(logos)
        case let (.networks, _, logos?): content = .networks(logos)
        default: return nil
        }
        return Row(id: shelf.id, title: shelf.title, content: content, seeAll: seeAll)
    }

    /// A server older than 0.49: the fixed keys, in the page's usual order.
    static func fixedRows(_ shelves: API.DiscoverShelves) -> [Row] {
        API.DiscoverShelf.allCases.map { shelf in
            let content: Row.Content
            switch shelf {
            case .recentlyAdded: content = .posters(shelves.recentlyAdded)
            case .trending: content = .posters(shelves.trending)
            case .popularMovies: content = .posters(shelves.popularMovies)
            case .movieGenres: content = .genres(shelves.movieGenres, .movie)
            case .upcomingMovies: content = .posters(shelves.upcomingMovies)
            case .studios:
                content = .studios(shelves.studios.map { API.NetworkCard(tmdbId: $0.tmdbId, name: $0.name, logoPath: $0.logoPath) })
            case .popularSeries: content = .posters(shelves.popularSeries)
            case .seriesGenres: content = .genres(shelves.seriesGenres, .tv)
            case .upcomingSeries: content = .posters(shelves.upcomingSeries)
            case .networks: content = .networks(shelves.networks)
            }
            return Row(id: shelf.rawValue, title: shelf.title, content: content, seeAll: shelves.seeAllDestination(shelf))
        }
    }
}

extension API.DiscoverShelf {
    /// The heading the page shows for a fixed-key shelf.
    var title: String {
        switch self {
        case .recentlyAdded: return String(localized: "Recently Added")
        case .trending: return String(localized: "Trending")
        case .popularMovies: return String(localized: "Popular Movies")
        case .movieGenres: return String(localized: "Movie Genres")
        case .upcomingMovies: return String(localized: "Upcoming Movies")
        case .studios: return String(localized: "Studios")
        case .popularSeries: return String(localized: "Popular Series")
        case .seriesGenres: return String(localized: "Series Genres")
        case .upcomingSeries: return String(localized: "Upcoming Series")
        case .networks: return String(localized: "Networks")
        }
    }
}
