import Foundation

// The Library page (api-v1.md §17, 0.51+). A read-only API key is enough for
// all four; a server older than 0.51 answers `.notFound` on each.

extension MarqueeAPI {
    struct LibraryEndpoints: Sendable {
        let transport: Transport

        /// `GET /library` — one page of the household library, filtered and
        /// sorted, with the counts and filter choices of all of it. Continue
        /// while `hasMorePages`.
        func page(_ query: API.LibraryQuery = API.LibraryQuery(), page: Int = 1) async throws -> API.LibraryPageResponse {
            try await transport.get("/library", query: query.queryItems(page: page))
        }

        /// `GET /library/collections-missing` — the "Missing from collections"
        /// tab, A–Z. TMDb collections are fetched live.
        func collectionsMissing() async throws -> [API.LibraryCollection] {
            let list: API.ListResponse<API.LibraryCollection> = try await transport.get("/library/collections-missing", timeout: Timeout.tmdb)
            return list.results
        }

        /// `GET /library/duplicates` (admin) — the Duplicates tab, A–Z.
        /// `.forbidden` for a member.
        func duplicates() async throws -> [API.LibraryDuplicate] {
            let list: API.ListResponse<API.LibraryDuplicate> = try await transport.get("/library/duplicates")
            return list.results
        }

        /// `GET /library/storage` — the Storage card. Reads Sonarr/Radarr live.
        func storage() async throws -> API.LibraryStorage {
            try await transport.get("/library/storage", timeout: Timeout.integrations)
        }
    }
}
