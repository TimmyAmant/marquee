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
        /// "See all" → the Movies grid.
        let popularMovies: [TitleCard]
        let movieGenres: [GenreTile]
        let upcomingMovies: [TitleCard]
        let studios: [CompanyCard]
        /// "See all" → the Series grid.
        let popularSeries: [TitleCard]
        let seriesGenres: [GenreTile]
        let upcomingSeries: [TitleCard]
        let networks: [NetworkCard]
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
