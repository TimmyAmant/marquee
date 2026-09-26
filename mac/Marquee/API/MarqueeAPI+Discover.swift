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
        /// (0.42.3+). Continue while `hasMorePages`. `recently-added` needs no
        /// TMDb; the others do.
        func list(_ list: API.DiscoverList, page: Int = 1) async throws -> API.DiscoverListPage {
            guard list.isKnown else { throw APIError.notFound }
            return try await transport.get("/discover/lists/\(list.rawValue)", query: ["page": String(page)], timeout: Timeout.tmdb)
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

        /// `GET /search/suggest?q=` — type-ahead; under 2 characters is always empty.
        func suggestions(_ query: String) async throws -> [API.SearchSuggestion] {
            let list: API.ListResponse<API.SearchSuggestion> = try await transport.get("/search/suggest", query: ["q": query])
            return list.results
        }
    }
}
