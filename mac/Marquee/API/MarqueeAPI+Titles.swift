import Foundation

// The title page and its Sonarr/Radarr actions (api-v1.md §3–4). Requesting a
// title is `requests.create`.

extension MarqueeAPI {
    struct TitlesEndpoints: Sendable {
        let transport: Transport

        /// `GET /titles/{type}/{tmdbId}` — everything the title page renders.
        func detail(_ type: API.MediaType, id tmdbId: Int) async throws -> API.TitleDetail {
            try await transport.get(Self.path(type, tmdbId), timeout: Timeout.tmdb)
        }

        /// `GET /titles/tv/{tmdbId}/seasons/{seasonNumber}` — one season's episodes.
        func season(_ seasonNumber: Int, ofShow tmdbId: Int) async throws -> API.SeasonEpisodes {
            try await transport.get(Self.path(.tv, tmdbId) + "/seasons/\(seasonNumber)", timeout: Timeout.tmdb)
        }

        /// `GET /titles/{type}/{tmdbId}/status` — just `library` + `viewer`, the
        /// cheap refresh after an action (see `TitleDetail.updating(_:)`).
        func status(_ type: API.MediaType, id tmdbId: Int) async throws -> API.TitleStatus {
            try await transport.get(Self.path(type, tmdbId) + "/status", timeout: Timeout.tmdb)
        }

        /// `POST /titles/{type}/{tmdbId}/add` — "Add to Radarr/Sonarr" and poster
        /// quick-add (admin). `.conflict("Connect Radarr in Settings first.")` etc.
        /// `is4k` (0.37+, `viewer.fourK.canAdd`) is "Add to 4K Radarr/Sonarr",
        /// sent as `{"is4k": true}`. `overrides` (0.43+, "Advanced") pick the
        /// server, profile, folder, tags and series type, in the same body.
        /// With neither there's no body, as before.
        func add(_ type: API.MediaType, id tmdbId: Int, is4k: Bool = false, overrides: API.AddOverrides? = nil) async throws {
            let body: (any Encodable & Sendable)? = is4k || overrides != nil
                ? API.TitleAddBody(is4k: is4k ? true : nil, overrides: overrides)
                : nil
            let _: API.OK = try await transport.mutate(
                .post, Self.path(type, tmdbId) + "/add", body: body, timeout: Timeout.integrations, changes: [.library, .requests]
            )
        }

        /// `GET /titles/movie/{tmdbId}/collection-rest` (0.72+) — the rest of
        /// a movie's collection the viewer can still add (the admin) or request
        /// (a member), offered once the movie itself is added or requested.
        /// `collection` is nil when there's nothing to offer; an older server
        /// answers `.notFound` (offer nothing).
        func collectionRest(movie tmdbId: Int) async throws -> API.CollectionRest {
            try await transport.get(Self.path(.movie, tmdbId) + "/collection-rest", timeout: Timeout.tmdb)
        }

        /// `POST /titles/movie/{tmdbId}/collection-rest` (0.72+) — "Add them
        /// too": the admin adds them, a member requests them. A partial result
        /// still succeeds, with `message`.
        func addCollectionRest(movie tmdbId: Int) async throws -> API.CollectionRestResult {
            try await transport.mutate(
                .post, Self.path(.movie, tmdbId) + "/collection-rest", body: nil, timeout: Timeout.integrations,
                changes: [.library, .requests]
            )
        }

        /// `GET /titles/{type}/{tmdbId}/add-options` (admin or trusted, 0.43+)
        /// — the servers "Advanced" can pick, default first, with their lists
        /// and defaults. `is4k` lists the 4K servers instead. `.notFound` from
        /// an older server: hide "Advanced".
        /// `requestId` (the request being reviewed) or `forRequest` (one being
        /// made) apply the override rules (0.58+, `rule`); an older server
        /// ignores them.
        func addOptions(
            _ type: API.MediaType,
            id tmdbId: Int,
            is4k: Bool = false,
            requestId: String? = nil,
            forRequest: Bool = false
        ) async throws -> API.AddOptions {
            try await transport.get(
                Self.path(type, tmdbId) + "/add-options",
                query: ["is4k": is4k ? "true" : nil, "requestId": requestId, "forRequest": forRequest ? "true" : nil],
                timeout: Timeout.integrations
            )
        }

        /// `POST /titles/{type}/{tmdbId}/remove-from-arr` (admin, 0.58+) —
        /// "Remove from Radarr/Sonarr", with its files when `deleteFiles`. The
        /// approved requests for it are marked removed. `.notFound` from an
        /// older server; `.conflict("Not tracked in Radarr/Sonarr.")`.
        @discardableResult
        func removeFromArr(
            _ type: API.MediaType, id tmdbId: Int, deleteFiles: Bool, is4k: Bool = false, reason: String? = nil
        ) async throws -> API.RemoveFromArrResult {
            try await transport.mutate(
                .post, Self.path(type, tmdbId) + "/remove-from-arr",
                body: API.RemoveFromArrBody(deleteFiles: deleteFiles, is4k: is4k ? true : nil, reason: reason),
                timeout: Timeout.integrations, changes: [.library, .requests]
            )
        }

        /// `POST /titles/{type}/{tmdbId}/search` — "Search now" (admin). Website text: "Search queued."
        func searchNow(_ type: API.MediaType, id tmdbId: Int) async throws {
            let _: API.OK = try await transport.mutate(
                .post, Self.path(type, tmdbId) + "/search", timeout: Timeout.integrations, changes: .library
            )
        }

        /// `PUT /titles/{type}/{tmdbId}/monitored` — "Stop/Start monitoring" (admin).
        /// Returns the new state.
        @discardableResult
        func setMonitored(_ monitored: Bool, _ type: API.MediaType, id tmdbId: Int) async throws -> Bool {
            struct Body: Encodable, Sendable { let monitored: Bool }
            let result: API.MonitoredResult = try await transport.mutate(
                .put, Self.path(type, tmdbId) + "/monitored", body: Body(monitored: monitored),
                timeout: Timeout.integrations, changes: .library
            )
            return result.monitored
        }

        /// `POST /titles/{type}/{tmdbId}/relink` — "Wrong match? Fix ID" (admin).
        /// Returns the new TMDb id; navigate there.
        func relink(_ type: API.MediaType, id tmdbId: Int, to target: API.RelinkTarget) async throws -> Int {
            let result: API.RelinkResult = try await transport.mutate(
                .post, Self.path(type, tmdbId) + "/relink", body: target, timeout: Timeout.tmdb, changes: [.library, .requests]
            )
            return result.newTmdbId
        }

        /// `POST /titles/{type}/{tmdbId}/block` (admin, 0.41+) — "Block
        /// requests", with an optional reason (≤ 200 characters) shown to
        /// whoever asks. A blank reason sends no body.
        func block(_ type: API.MediaType, id tmdbId: Int, reason: String? = nil) async throws {
            let body: (any Encodable & Sendable)? = reason.nonBlank.map { API.BlockTitleRequest(reason: $0) }
            let _: API.OK = try await transport.mutate(
                .post, Self.path(type, tmdbId) + "/block", body: body, changes: [.library, .settings]
            )
        }

        /// `DELETE /titles/{type}/{tmdbId}/block` (admin, 0.41+) — "Unblock requests".
        func unblock(_ type: API.MediaType, id tmdbId: Int) async throws {
            let _: API.OK = try await transport.mutate(
                .delete, Self.path(type, tmdbId) + "/block", changes: [.library, .settings]
            )
        }

        static func path(_ type: API.MediaType, _ tmdbId: Int) -> String {
            "/titles/\(MarqueeAPI.segment(type))/\(tmdbId)"
        }
    }

    struct PeopleEndpoints: Sendable {
        let transport: Transport

        /// `GET /people/{tmdbId}` — bio and acting filmography.
        func detail(_ tmdbId: Int) async throws -> API.PersonDetail {
            try await transport.get("/people/\(tmdbId)", timeout: Timeout.tmdb)
        }
    }

    struct CompaniesEndpoints: Sendable {
        let transport: Transport

        /// `GET /companies/{tmdbId}` — a studio and its catalog.
        func detail(_ tmdbId: Int) async throws -> API.CompanyDetail {
            try await transport.get("/companies/\(tmdbId)", timeout: Timeout.tmdb)
        }

        /// `GET /networks/{tmdbId}` (0.76+) — a TV network and its series, in
        /// a studio's shape. An older server answers 404.
        func network(_ tmdbId: Int) async throws -> API.CompanyDetail {
            try await transport.get("/networks/\(tmdbId)", timeout: Timeout.tmdb)
        }
    }
}
