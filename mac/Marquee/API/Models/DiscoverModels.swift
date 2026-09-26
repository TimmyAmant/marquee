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

        var id: Int { tmdbId }
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
        /// Where each shelf's "See all" goes (0.42.3+); nil from an older server.
        let seeAll: DiscoverSeeAll?

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
        case trending
        case upcomingMovies
        case upcomingSeries
        case unknown(String)

        static let knownCases: [DiscoverList] = [.recentlyAdded, .trending, .upcomingMovies, .upcomingSeries]

        var rawValue: String {
            switch self {
            case .recentlyAdded: return "recently-added"
            case .trending: return "trending"
            case .upcomingMovies: return "upcoming-movies"
            case .upcomingSeries: return "upcoming-series"
            case let .unknown(raw): return raw
            }
        }

        /// The heading until the server's own `title` arrives.
        var label: String {
            switch self {
            case .recentlyAdded: return "Recently Added"
            case .trending: return "Trending"
            case .upcomingMovies: return "Upcoming Movies"
            case .upcomingSeries: return "Upcoming Series"
            case .unknown: return "Discover"
            }
        }

        /// Trending and Recently Added mix movies and series, so their cards
        /// carry the MOVIE/SERIES pill.
        var mixesMediaTypes: Bool {
            switch self {
            case .recentlyAdded, .trending: return true
            case .upcomingMovies, .upcomingSeries, .unknown: return false
            }
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
        /// than 0.42.3) only Popular Movies/Series and the genre shelves have
        /// one, to the grids; an unknown type, list or media type is none.
        static func resolve(_ shelf: DiscoverShelf, in seeAll: DiscoverSeeAll?) -> SeeAllDestination? {
            guard let seeAll else {
                switch shelf {
                case .popularMovies, .movieGenres: return .browse(.movie)
                case .popularSeries, .seriesGenres: return .browse(.tv)
                default: return nil
                }
            }
            guard let target = seeAll[shelf] else { return nil }
            switch target.type {
            case .list:
                guard let list = target.list, list.isKnown else { return nil }
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
            case .popularity: return "Popular"
            case .topRated: return "Top rated"
            case .newest: return "Newest"
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

    /// `GET /search?q=`: the search results page. All four empty → "No results for "…"."
    struct SearchResults: Codable, Hashable, Sendable {
        /// A genre or keyword the query named: "{label} movies & TV".
        struct Theme: Codable, Hashable, Sendable {
            let label: String
            let items: [TitleCard]
        }

        let query: String
        let people: [PersonCard]
        let studios: [CompanyCard]
        /// With status, favorited and canQuickAdd.
        let titles: [TitleCard]
        let theme: Theme?

        var isEmpty: Bool {
            people.isEmpty && studios.isEmpty && titles.isEmpty && (theme?.items.isEmpty ?? true)
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
        "TMDb isn't configured on this server. An admin needs to add a TMDb access token in Settings → Integrations."

    /// TMDb isn't set up on the server: show the "Connect TMDb to start
    /// browsing" notice rather than the error text.
    var isTMDbUnconfigured: Bool {
        if case let .upstream(message) = self { return message == Self.tmdbUnconfiguredMessage }
        return false
    }
}
