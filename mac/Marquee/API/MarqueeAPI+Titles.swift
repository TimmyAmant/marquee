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

        /// `GET /titles/{type}/{tmdbId}/add-options` (admin or trusted, 0.43+)
        /// — the servers "Advanced" can pick, default first, with their lists
        /// and defaults. `is4k` lists the 4K servers instead. `.notFound` from
        /// an older server: hide "Advanced".
        func addOptions(_ type: API.MediaType, id tmdbId: Int, is4k: Bool = false) async throws -> API.AddOptions {
            try await transport.get(
                Self.path(type, tmdbId) + "/add-options", query: ["is4k": is4k ? "true" : nil], timeout: Timeout.integrations
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
    }
}
