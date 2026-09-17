import Foundation

// Favorites (api-v1.md §6). Each call returns the entity's favorited state
// after it ran.

extension MarqueeAPI {
    struct FavoritesEndpoints: Sendable {
        let transport: Transport

        /// `GET /favorites` — the Favorites page.
        func all() async throws -> API.FavoritesResponse {
            try await transport.get("/favorites", timeout: Timeout.tmdb)
        }

        /// `GET /favorites/{entityType}/{tmdbId}`.
        func isFavorited(_ type: API.FavoriteEntityType, id tmdbId: Int) async throws -> Bool {
            let state: API.FavoriteState = try await transport.get(Self.path(type, tmdbId))
            return state.favorited
        }

        /// `PUT /favorites/{entityType}/{tmdbId}` — favorite (idempotent).
        @discardableResult
        func add(_ type: API.FavoriteEntityType, id tmdbId: Int) async throws -> Bool {
            let state: API.FavoriteState = try await transport.mutate(.put, Self.path(type, tmdbId), timeout: Timeout.tmdb, changes: .favorites)
            return state.favorited
        }

        /// `DELETE /favorites/{entityType}/{tmdbId}` — unfavorite (idempotent).
        @discardableResult
        func remove(_ type: API.FavoriteEntityType, id tmdbId: Int) async throws -> Bool {
            let state: API.FavoriteState = try await transport.mutate(.delete, Self.path(type, tmdbId), changes: .favorites)
            return state.favorited
        }

        /// `POST /favorites/{entityType}/{tmdbId}/toggle` — the star button.
        @discardableResult
        func toggle(_ type: API.FavoriteEntityType, id tmdbId: Int) async throws -> Bool {
            let state: API.FavoriteState = try await transport.mutate(.post, Self.path(type, tmdbId) + "/toggle", timeout: Timeout.tmdb, changes: .favorites)
            return state.favorited
        }

        /// `add` or `remove`: sets an explicit state (no double-click races).
        @discardableResult
        func set(_ favorited: Bool, _ type: API.FavoriteEntityType, id tmdbId: Int) async throws -> Bool {
            favorited ? try await add(type, id: tmdbId) : try await remove(type, id: tmdbId)
        }

        static func path(_ type: API.FavoriteEntityType, _ tmdbId: Int) -> String {
            "/favorites/\(MarqueeAPI.segment(type))/\(tmdbId)"
        }
    }
}
