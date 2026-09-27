import Foundation

// Discover, the Movies/Series grids, Surprise me, and search (api-v1.md §2),
// plus the card shapes every list shares.

extension API {
    /// A poster card. Fields a list doesn't compute on the website are null
    /// (`favorited`, `requested`) or false (`canQuickAdd`, `canRequest`);
    /// each endpoint documents which it fills in.
    struct TitleCard: Codable, Hashable, Sendable, Identifiable {
        let mediaType: MediaType
        let tmdbId: Int
        let name: String
        let posterPath: ImageRef?
        /// `"1999"`.
        let year: String?
        /// A role/character (filmography), a genre name (Movies/Series grid), else nil.
        let subtitle: String?
        /// Movies/Series grid only.
        let overview: String?
        /// TMDb vote average, 0–10. Movies/Series grid only.
        let rating: Double?
        /// nil = not in the library at all (no badge). `var` so a card can be
        /// redrawn with what this Mac just changed (see `TitleStateStore`).
        var status: LibraryStatus?
        /// nil where the website shows no favorite star on that list.
        let favorited: Bool?
        /// You already have a pending or approved request (franchise/similar rows); nil elsewhere.
        var requested: Bool?
        /// Show "+ Add" (`POST /titles/{type}/{id}/add`).
        var canQuickAdd: Bool
        /// Show "Request", or "Requested" when `requested` is true.
        let canRequest: Bool

        var id: TitleID { TitleID(mediaType, tmdbId) }

        /// Subtitle and year joined the way the card footer shows them: "Neo · 1999".
        var footerLine: String {
            [subtitle, year].compactMap(\.nonBlank).joined(separator: " · ")
        }
    }

    struct PersonCard: Codable, Hashable, Sendable, Identifiable {
        let tmdbId: Int
        let name: String
        let profilePath: ImageRef?
        let knownForDepartment: String?
        /// nil where the website shows no star.
        let favorited: Bool?
        /// Search only (0.55+): up to three titles they're known for.
        var knownFor: [String]?

        var id: Int { tmdbId }

        /// "Acting · The Matrix, John Wick" — search's line under the photo.
        var knownForLine: String? {
            let titles = (knownFor ?? []).filter { !$0.isEmpty }.joined(separator: ", ")
            switch (knownForDepartment?.nonBlank, titles.isEmpty ? nil : titles) {
            case let (department?, titles?): return "\(department) · \(titles)" // i18n-ignore
            case let (department?, nil): return department
            case let (nil, titles?): return titles
            case (nil, nil): return nil
            }
        }
    }

    /// A studio (production company).
    struct CompanyCard: Codable, Hashable, Sendable, Identifiable {
        let tmdbId: Int
        let name: String
        let logoPath: ImageRef?
        /// nil on Discover's Studios shelf (no star there).
        let favorited: Bool?

        var id: Int { tmdbId }
    }

    /// A TV network: its logo links to `/series?network=`.
    struct NetworkCard: Codable, Hashable, Sendable, Identifiable {
        let tmdbId: Int
        let name: String
        let logoPath: ImageRef?

        var id: Int { tmdbId }
    }

    struct Genre: Codable, Hashable, Sendable, Identifiable {
        let id: Int
        let name: String
    }

    /// A Discover genre tile: links to `/movies?genre=` or `/series?genre=`.
    struct GenreTile: Codable, Hashable, Sendable, Identifiable {
        let id: Int
        let name: String
        let backdropPath: ImageRef?
    }

    /// `GET /discover`: shelves in page order. Cards carry `status` only.
    /// Empty shelves are empty arrays; the website hides them.
    struct DiscoverShelves: Codable, Hashable, Sendable {
        /// From Plex/Jellyfin, newest first, max 20.
        let recentlyAdded: [TitleCard]
        let trending: [TitleCard]
        let popularMovies: [TitleCard]
        let movieGenres: [GenreTile]
        let upcomingMovies: [TitleCard]
        let studios: [CompanyCard]
        let popularSeries: [TitleCard]
        let seriesGenres: [GenreTile]
        let upcomingSeries: [TitleCard]
        let networks: [NetworkCard]
        /// Where each shelf's "See all" goes (0.42.4+); nil from an older server.
        let seeAll: DiscoverSeeAll?
        /// The rows in the admin's order, hidden ones left out, the admin's
        /// own rows included (0.49+). nil from an older server: show the
        /// fixed keys above in their usual order.
        let shelves: [DiscoverRow]?

        /// Where `shelf`'s "See all" chevron goes, nil for none.
        func seeAllDestination(_ shelf: DiscoverShelf) -> SeeAllDestination? {
            SeeAllDestination.resolve(shelf, in: seeAll)
        }
    }

    /// A `GET /discover` shelf, by its key in the response.
    enum DiscoverShelf: String, CaseIterable, Hashable, Sendable {
        case recentlyAdded
        case trending
        case popularMovies
        case movieGenres
        case upcomingMovies
        case studios
        case popularSeries
        case seriesGenres
        case upcomingSeries
        case networks
    }

    /// A Discover shelf's full list: `GET /discover/lists/{list}`.
    enum DiscoverList: OpenEnum {
        case recentlyAdded
        /// 0.53+: "Your Watchlist", the viewer's own Plex Watchlist.
        case watchlist
        case trending
        case upcomingMovies
        case upcomingSeries
        case unknown(String)

        static let knownCases: [DiscoverList] = [.recentlyAdded, .watchlist, .trending, .upcomingMovies, .upcomingSeries]

        var rawValue: String {
            switch self {
            case .recentlyAdded: return "recently-added"
            case .watchlist: return "watchlist"
            case .trending: return "trending"
            case .upcomingMovies: return "upcoming-movies"
            case .upcomingSeries: return "upcoming-series"
            case let .unknown(raw): return raw
            }
        }

        /// The heading until the server's own `title` arrives.
        var label: String {
            switch self {
            case .recentlyAdded: return String(localized: "Recently Added")
            case .watchlist: return String(localized: "Your Watchlist")
            case .trending: return String(localized: "Trending")
            case .upcomingMovies: return String(localized: "Upcoming Movies")
            case .upcomingSeries: return String(localized: "Upcoming Series")
            case .unknown: return String(localized: "Discover")
            }
        }

        /// Trending and Recently Added mix movies and series, so their cards
        /// carry the MOVIE/SERIES pill; so can an admin's own row (0.49+).
        var mixesMediaTypes: Bool {
            switch self {
            case .recentlyAdded, .watchlist, .trending, .unknown: return true
            case .upcomingMovies, .upcomingSeries: return false
            }
        }

        /// A custom Discover row's id (a uuid, 0.49+): its "See all" is
        /// `GET /discover/lists/{id}` too.
        var isCustomRow: Bool {
            if case let .unknown(raw) = self { return UUID(uuidString: raw) != nil }
            return false
        }
    }

    /// One shelf's `seeAll` entry. Every field is optional and open, so a
    /// value this app doesn't know only drops that shelf's "See all".
    struct SeeAllTarget: Codable, Hashable, Sendable {
        enum Kind: OpenEnum {
            case list
            case browse
            case unknown(String)

            static let knownCases: [Kind] = [.list, .browse]

            var rawValue: String {
                switch self {
                case .list: return "list"
                case .browse: return "browse"
                case let .unknown(raw): return raw
                }
            }
        }

        let type: Kind?
        /// With `type: "list"`.
        let list: DiscoverList?
        /// With `type: "browse"`: the Movies (`movie`) or Series (`tv`) grid.
        let mediaType: MediaType?

        init(type: Kind?, list: DiscoverList? = nil, mediaType: MediaType? = nil) {
            self.type = type
            self.list = list
            self.mediaType = mediaType
        }
    }

    /// `GET /discover`'s `seeAll`, keyed like the shelves. A missing or null
    /// entry is no "See all" for that shelf.
    struct DiscoverSeeAll: Codable, Hashable, Sendable {
        var recentlyAdded: SeeAllTarget?
        var trending: SeeAllTarget?
        var popularMovies: SeeAllTarget?
        var movieGenres: SeeAllTarget?
        var upcomingMovies: SeeAllTarget?
        var studios: SeeAllTarget?
        var popularSeries: SeeAllTarget?
        var seriesGenres: SeeAllTarget?
        var upcomingSeries: SeeAllTarget?
        var networks: SeeAllTarget?

        subscript(shelf: DiscoverShelf) -> SeeAllTarget? {
            get {
                switch shelf {
                case .recentlyAdded: return recentlyAdded
                case .trending: return trending
                case .popularMovies: return popularMovies
                case .movieGenres: return movieGenres
                case .upcomingMovies: return upcomingMovies
                case .studios: return studios
                case .popularSeries: return popularSeries
                case .seriesGenres: return seriesGenres
                case .upcomingSeries: return upcomingSeries
                case .networks: return networks
                }
            }
            set {
                switch shelf {
                case .recentlyAdded: recentlyAdded = newValue
                case .trending: trending = newValue
                case .popularMovies: popularMovies = newValue
                case .movieGenres: movieGenres = newValue
                case .upcomingMovies: upcomingMovies = newValue
                case .studios: studios = newValue
                case .popularSeries: popularSeries = newValue
                case .seriesGenres: seriesGenres = newValue
                case .upcomingSeries: upcomingSeries = newValue
                case .networks: networks = newValue
                }
            }
        }
    }

    /// Where a shelf's "See all" chevron goes.
    enum SeeAllDestination: Hashable, Sendable {
        /// `DiscoverListView`.
        case list(DiscoverList)
        /// The unfiltered Movies or Series grid.
        case browse(MediaType)

        /// `shelf`'s destination under `seeAll`. Without it (a server older
        /// than 0.42.4) only Popular Movies/Series and the genre shelves have
        /// one, to the grids; an unknown type, list or media type is none.
        static func resolve(_ shelf: DiscoverShelf, in seeAll: DiscoverSeeAll?) -> SeeAllDestination? {
            guard let seeAll else {
                switch shelf {
                case .popularMovies, .movieGenres: return .browse(.movie)
                case .popularSeries, .seriesGenres: return .browse(.tv)
                default: return nil
                }
            }
            return resolve(seeAll[shelf])
        }

        /// One target as it came. With `customRows` (a `shelves` row) it opens
        /// the admin's own rows too (a `list` that is the row's uuid, 0.49+).
        static func resolve(_ target: SeeAllTarget?, customRows: Bool = false) -> SeeAllDestination? {
            guard let target else { return nil }
            switch target.type {
            case .list:
                guard let list = target.list, list.isKnown || (customRows && list.isCustomRow) else { return nil }
                return .list(list)
            case .browse:
                guard let mediaType = target.mediaType, mediaType.isKnown else { return nil }
                return .browse(mediaType)
            case .unknown, nil:
                return nil
            }
        }
    }

    /// `GET /discover/lists/{list}`: one page of a shelf's full list. Like
    /// the Movies grid, titles can reappear on later pages; skip ones
    /// already shown.
    struct DiscoverListPage: Codable, Hashable, Sendable {
        let list: DiscoverList
        /// "Trending".
        let title: String
        let page: Int
        let totalPages: Int
        let totalResults: Int
        /// With status, favorited and canQuickAdd.
        let results: [TitleCard]

        /// Continue while `page < totalPages`.
        var hasMorePages: Bool { page < totalPages }
    }

    /// `GET /movies` / `/series` sort.
    enum BrowseSort: String, Codable, CaseIterable, Hashable, Sendable, Identifiable {
        case popularity
        case topRated = "top_rated"
        case newest

        var id: String { rawValue }

        var label: String {
            switch self {
            case .popularity: return String(localized: "Popular")
            case .topRated: return String(localized: "Top rated")
            case .newest: return String(localized: "Newest")
            }
        }
    }

    /// The Movies/Series grid's filters (`GET /movies`, `/series`). Page
    /// through with `page`; `extrasQuery` drives the matching `/extras` call.
    struct BrowseQuery: Hashable, Sendable {
        var sort: BrowseSort = .popularity
        /// TMDb genre id, from `BrowseExtras.genres`.
        var genreId: Int?
        /// 1800–3000.
        var year: Int?
        /// Series only; the server ignores it for movies.
        var networkId: Int?
        /// Hide anything already in the library (the website's default when signed in).
        var hideOwned = true

        init(sort: BrowseSort = .popularity, genreId: Int? = nil, year: Int? = nil, networkId: Int? = nil, hideOwned: Bool = true) {
            self.sort = sort
            self.genreId = genreId
            self.year = year
            self.networkId = networkId
            self.hideOwned = hideOwned
        }

        func queryItems(page: Int) -> [String: String?] {
            [
                "sort": sort.rawValue,
                "genre": genreId.map(String.init),
                "year": year.map(String.init),
                "network": networkId.map(String.init),
                "hideOwned": hideOwned ? "true" : "false",
                "page": String(page),
            ]
        }

        var extrasQueryItems: [String: String?] {
            [
                "genre": genreId.map(String.init),
                "year": year.map(String.init),
                "network": networkId.map(String.init),
            ]
        }
    }

    /// A Movies/Series grid page: a batch of several TMDb pages, de-duplicated,
    /// so page sizes vary. Titles can reappear on later pages; skip ones
    /// already shown.
    typealias BrowsePage = Paginated<TitleCard>

    /// `GET /movies/extras` / `/series/extras`: everything on the page besides the grid.
    struct BrowseExtras: Codable, Hashable, Sendable {
        struct BecauseYouWatched: Codable, Hashable, Sendable {
            /// "Because you watched {title}".
            let title: String
            /// ≤ 12, with status, favorited and canQuickAdd.
            let items: [TitleCard]
        }

        /// The genre filter's options.
        let genres: [Genre]
        /// The active network chip; nil without `?network=`.
        let network: NetworkCard?
        /// nil with a genre/year filter or no Plex watch history of this media type.
        let becauseYouWatched: BecauseYouWatched?
    }

    /// `POST /surprise` body. Omitted fields use the server's defaults
    /// (`type: "all"`, `hideOwned: true`).
    struct SurpriseRequest: Encodable, Hashable, Sendable {
        enum Kind: String, Encodable, Sendable {
            case movie
            case tv
            case all
        }

        var type: Kind?
        var genreId: Int?
        var year: Int?
        var hideOwned: Bool?

        init(type: Kind? = nil, genreId: Int? = nil, year: Int? = nil, hideOwned: Bool? = nil) {
            self.type = type
            self.genreId = genreId
            self.year = year
            self.hideOwned = hideOwned
        }
    }

    /// `GET /search?q=`: the search results page. All empty → "No results for "…"."
    struct SearchResults: Codable, Hashable, Sendable {
        /// A genre or keyword the query named: "{label} movies & TV".
        struct Theme: Codable, Hashable, Sendable {
            let label: String
            let items: [TitleCard]
            /// 0.55+: "first" when the query is that genre/keyword itself
            /// ("horror"), so its shelf leads the page; "last" (or nil, from an
            /// older server) puts it after the other sections.
            var placement: String?

            var leadsPage: Bool { placement == "first" }
        }

        /// One section (0.55+): TMDb's first page, best match first, and
        /// how many there are in all — the heading's count.
        struct Section<Item: Codable & Hashable & Sendable>: Codable, Hashable, Sendable {
            let totalResults: Int
            let totalPages: Int
            let results: [Item]

            /// More than the section shows: offer See all.
            var hasMore: Bool { totalResults > results.count }
        }

        /// 0.55+: the page in the order to show it — movies, series, people,
        /// studios & networks.
        struct Sections: Codable, Hashable, Sendable {
            let movies: Section<TitleCard>
            let series: Section<TitleCard>
            let people: Section<PersonCard>
            let studiosAndNetworks: Section<SearchCompanyCard>
        }

        let query: String
        let people: [PersonCard]
        let studios: [CompanyCard]
        /// With status, favorited and canQuickAdd.
        let titles: [TitleCard]
        let theme: Theme?
        /// nil from a server before 0.55 (SearchPageLayout falls back to the
        /// fields above).
        var sections: Sections?

        var isEmpty: Bool {
            let sectionsEmpty = sections.map {
                $0.movies.results.isEmpty && $0.series.results.isEmpty && $0.people.results.isEmpty
                    && $0.studiosAndNetworks.results.isEmpty
            } ?? true
            return sectionsEmpty && people.isEmpty && studios.isEmpty && titles.isEmpty && (theme?.items.isEmpty ?? true)
        }
    }

    /// A studio or network in search's Studios & Networks (0.55+): a studio
    /// opens its company page, a network the Series grid filtered to it.
    struct SearchCompanyCard: Codable, Hashable, Sendable, Identifiable {
        /// "studio" or "network"; anything else is treated as a studio.
        let kind: String
        let tmdbId: Int
        let name: String
        let logoPath: ImageRef?
        /// Always nil for a network (no star).
        let favorited: Bool?

        var isNetwork: Bool { kind == "network" }
        var id: String { "\(kind)-\(tmdbId)" }

        init(kind: String, tmdbId: Int, name: String, logoPath: ImageRef?, favorited: Bool?) {
            self.kind = kind
            self.tmdbId = tmdbId
            self.name = name
            self.logoPath = logoPath
            self.favorited = favorited
        }

        /// An older server's studio.
        init(studio: CompanyCard) {
            self.init(kind: "studio", tmdbId: studio.tmdbId, name: studio.name, logoPath: studio.logoPath, favorited: studio.favorited)
        }
    }

    /// `GET /search/{section}` (0.55+): which section's See all.
    enum SearchSectionName: String, Hashable, Sendable, CaseIterable {
        case movies, series, people, studios

        /// The section's heading, as on the website.
        var title: String {
            switch self {
            case .movies: return String(localized: "Movies")
            case .series: return String(localized: "TV Shows")
            case .people: return String(localized: "People")
            case .studios: return String(localized: "Studios & Networks")
            }
        }
    }

    /// `GET /search/suggest?q=`: header type-ahead, ≤ 7 people/movies/series.
    struct SearchSuggestion: Codable, Hashable, Sendable {
        /// A TMDb id: person ids and title ids overlap, so key lists by `stableId`.
        let id: Int
        let mediaType: SuggestionKind
        let name: String
        /// A poster for titles, a profile photo for people.
        let posterPath: ImageRef?
        /// The year for titles, the known-for department for people.
        let subtitle: String?
        /// The viewer's library status for a movie/series; nil for a person,
        /// and from a server that predates the field.
        var status: LibraryStatus?

        /// `"movie-603"`, unique across kinds.
        var stableId: String { "\(mediaType.rawValue)-\(id)" }

        /// The title to open, nil for a person.
        var titleID: TitleID? {
            mediaType.mediaType.map { TitleID($0, id) }
        }
    }
}

extension Paginated {
    /// Continue while `page < totalPages`.
    var hasMorePages: Bool { page < totalPages }
}

extension APIError {
    /// The server's message when no TMDb credential is configured. Every
    /// TMDb-backed screen turns this into the "Connect TMDb" empty state
    /// instead of a raw error.
    static let tmdbUnconfiguredMessage =
        "TMDb isn't configured on this server. An admin needs to add a TMDb access token in Settings → Integrations." // i18n-ignore: matched against the server's wire message

    /// TMDb isn't set up on the server: show the "Connect TMDb to start
    /// browsing" notice rather than the error text.
    var isTMDbUnconfigured: Bool {
        if case .tmdbUnconfigured = self { return true }
        // A server older than 0.50 sends no reason, and always English.
        if case let .upstream(message) = self { return message == Self.tmdbUnconfiguredMessage }
        return false
    }

    static var tmdbUnconfiguredFallback: String {
        String(localized: "TMDb isn't configured on this server. An admin needs to add a TMDb access token in Settings → Integrations.")
    }
}
