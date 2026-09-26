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
        /// sent as `{"is4k": true}`; otherwise there's no body, as before.
        func add(_ type: API.MediaType, id tmdbId: Int, is4k: Bool = false) async throws {
            let body: (any Encodable & Sendable)? = is4k ? API.FourKBody() : nil
            let _: API.OK = try await transport.mutate(
                .post, Self.path(type, tmdbId) + "/add", body: body, timeout: Timeout.integrations, changes: [.library, .requests]
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
