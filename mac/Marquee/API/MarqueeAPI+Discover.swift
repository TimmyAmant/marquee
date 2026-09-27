import Foundation

// Discover, the Movies/Series grids and search (api-v1.md §2). All need TMDb:
// without it they throw `.upstream("TMDb isn't configured on this server…")`.

extension MarqueeAPI {
    struct DiscoverEndpoints: Sendable {
        let transport: Transport

        /// `GET /discover` — the landing page's shelves.
        func shelves() async throws -> API.DiscoverShelves {
            try await transport.get("/discover", timeout: Timeout.tmdb)
        }

        /// `GET /discover/lists/{list}` — one page of a shelf's full list
        /// (0.42.4+), or of an admin's own row by its id (0.49+). Continue
        /// while `hasMorePages`. `recently-added` needs no TMDb; the others do.
        func list(_ list: API.DiscoverList, page: Int = 1) async throws -> API.DiscoverListPage {
            guard list.isKnown || list.isCustomRow else { throw APIError.notFound }
            return try await transport.get(
                "/discover/lists/\(MarqueeAPI.segment(list.rawValue))", query: ["page": String(page)], timeout: Timeout.tmdb
            )
        }

        /// `POST /surprise` —"🎲 Surprise me". `.notFound` when nothing matches.
        func surprise(_ request: API.SurpriseRequest = API.SurpriseRequest()) async throws -> API.TitleID {
            try await transport.post("/surprise", body: request, timeout: Timeout.tmdb)
        }
    }

    struct BrowseEndpoints: Sendable {
        let transport: Transport

        /// `GET /movies` or `/series` — one grid page. Continue while `hasMorePages`.
        func page(_ type: API.MediaType, _ query: API.BrowseQuery = API.BrowseQuery(), page: Int = 1) async throws -> API.BrowsePage {
            try await transport.get(try Self.path(type), query: query.queryItems(page: page), timeout: Timeout.tmdb)
        }

        /// `GET /movies/extras` or `/series/extras` — genres, the network chip, "Because you watched".
        func extras(_ type: API.MediaType, _ query: API.BrowseQuery = API.BrowseQuery()) async throws -> API.BrowseExtras {
            try await transport.get(try Self.path(type) + "/extras", query: query.extrasQueryItems, timeout: Timeout.tmdb)
        }

        private static func path(_ type: API.MediaType) throws -> String {
            switch type {
            case .movie: return "/movies"
            case .tv: return "/series"
            case .unknown: throw APIError.notFound
            }
        }
    }

    struct SearchEndpoints: Sendable {
        let transport: Transport

        /// `GET /search?q=` — the results page. A blank query is `.invalid`.
        func results(_ query: String) async throws -> API.SearchResults {
            try await transport.get("/search", query: ["q": query], timeout: Timeout.tmdb)
        }

        /// `GET /search/suggest?q=&include=company,network` — type-ahead,
        /// grouped movies, series, people, studios & networks (an older server
        /// ignores `include` and sends no studios or networks); under 2
        /// characters is always empty.
        func suggestions(_ query: String) async throws -> [API.SearchSuggestion] {
            let list: API.ListResponse<API.SearchSuggestion> = try await transport.get(
                "/search/suggest",
                query: ["q": query, "include": "company,network"]
            )
            return list.results
        }

        /// `GET /search/{movies|series}?q=&page=` (0.55+) — a title section's See all.
        func titles(_ section: API.SearchSectionName, query: String, page: Int) async throws -> Paginated<API.TitleCard> {
            try await transport.get("/search/\(section.rawValue)", query: ["q": query, "page": String(page)], timeout: Timeout.tmdb)
        }

        /// `GET /search/people?q=&page=` (0.55+) — People's See all.
        func people(query: String, page: Int) async throws -> Paginated<API.PersonCard> {
            try await transport.get("/search/people", query: ["q": query, "page": String(page)], timeout: Timeout.tmdb)
        }

        /// `GET /search/studios?q=&page=` (0.55+) — Studios & Networks' See all.
        func studios(query: String, page: Int) async throws -> Paginated<API.SearchCompanyCard> {
            try await transport.get("/search/studios", query: ["q": query, "page": String(page)], timeout: Timeout.tmdb)
        }
    }
}
