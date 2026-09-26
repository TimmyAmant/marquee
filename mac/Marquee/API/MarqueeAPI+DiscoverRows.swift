import Foundation

// Settings › Discover (api-v1.md §2, 0.49+, admin) and Trakt list syncs
// (§11, 0.49+, every account). All of it is `.notFound` from an older server.

extension MarqueeAPI {
    struct DiscoverSettingsEndpoints: Sendable {
        let transport: Transport

        /// `GET /settings/discover` (admin) — every row in order, hidden ones included.
        func load() async throws -> API.DiscoverSettings {
            try await transport.get("/settings/discover")
        }

        /// `PUT /settings/discover` (admin) — the rows in their new order,
        /// each shown or hidden. `.invalid("There's no Discover row …")`.
        func arrange(_ rows: [API.DiscoverRowSetting]) async throws -> API.DiscoverSettings {
            try await transport.mutate(.put, "/settings/discover", body: API.ArrangeDiscoverRequest(rows), changes: [.settings, .catalog])
        }

        /// `POST /settings/discover/shelves` (admin) — adds a row at the
        /// end, shown. `.invalid("Pick a keyword.")` and the like,
        /// `.conflict` past the limit, `.upstream` without TMDb.
        func add(_ request: API.AddDiscoverRowRequest) async throws -> API.DiscoverRowSetting {
            try await transport.mutate(.post, "/settings/discover/shelves", body: request, timeout: Timeout.tmdb, changes: [.settings, .catalog])
        }

        /// `PATCH /settings/discover/shelves/{id}` (admin) — show or hide any
        /// row; rename a custom one.
        func update(_ id: String, _ request: API.UpdateDiscoverRowRequest) async throws -> API.DiscoverRowSetting {
            try await transport.mutate(
                .patch, "/settings/discover/shelves/\(MarqueeAPI.segment(id))", body: request, changes: [.settings, .catalog]
            )
        }

        /// `DELETE /settings/discover/shelves/{id}` (admin) — removes a custom row.
        func remove(_ id: String) async throws {
            let _: API.OK = try await transport.mutate(
                .delete, "/settings/discover/shelves/\(MarqueeAPI.segment(id))", changes: [.settings, .catalog]
            )
        }

        /// `POST /settings/discover/reset` (admin) — the built-in rows back
        /// in their usual order, all shown; custom rows stay, after them.
        func reset() async throws -> API.DiscoverSettings {
            try await transport.mutate(.post, "/settings/discover/reset", changes: [.settings, .catalog])
        }

        /// `GET /settings/discover/lookup` (admin) — keywords, studios,
        /// networks or genres to build a row from. `mediaType` is the
        /// genre list's (`movie` or `tv`); a blank query sends no `q`.
        func lookup(_ type: API.DiscoverLookupType, query: String, mediaType: API.MediaType? = nil) async throws -> [API.DiscoverLookupResult] {
            let list: API.ListResponse<API.DiscoverLookupResult> = try await transport.get(
                "/settings/discover/lookup",
                query: [
                    "type": type.rawValue,
                    "q": query.nonBlank?.trimmingCharacters(in: .whitespacesAndNewlines),
                    "mediaType": type == .genre ? mediaType?.rawValue : nil,
                ],
                timeout: Timeout.tmdb
            )
            return list.results
        }
    }

    struct TraktSyncsEndpoints: Sendable {
        let transport: Transport

        /// `GET /trakt-syncs` — your synced lists; `all` (the admin only)
        /// includes everyone's.
        func list(all: Bool = false) async throws -> API.TraktSyncs {
            try await transport.get("/trakt-syncs", query: ["all": all ? "true" : nil])
        }

        /// `POST /trakt-syncs` — keep a public Trakt list or watchlist in
        /// sync. `.invalid` for a bad link, `.conflict` when Trakt isn't
        /// connected, it's already synced or past the limit.
        func add(_ request: API.CreateTraktSyncRequest) async throws -> API.TraktSync {
            try await transport.mutate(.post, "/trakt-syncs", body: request, timeout: Timeout.integrations, changes: [.settings, .requests])
        }

        /// `PATCH /trakt-syncs/{id}` — which kinds it requests.
        func update(_ id: String, _ request: API.UpdateTraktSyncRequest) async throws -> API.TraktSync {
            try await transport.mutate(.patch, "/trakt-syncs/\(MarqueeAPI.segment(id))", body: request, changes: .settings)
        }

        /// `POST /trakt-syncs/{id}/sync` — "Check now". `.rateLimited("Checked
        /// a moment ago. Try again in a minute.")`.
        func sync(_ id: String) async throws -> API.TraktSync {
            try await transport.mutate(
                .post, "/trakt-syncs/\(MarqueeAPI.segment(id))/sync", timeout: Timeout.longRunning, changes: [.settings, .requests]
            )
        }

        /// `DELETE /trakt-syncs/{id}` — stops syncing; its requests stay.
        func remove(_ id: String) async throws {
            let _: API.OK = try await transport.mutate(.delete, "/trakt-syncs/\(MarqueeAPI.segment(id))", changes: .settings)
        }
    }
}
