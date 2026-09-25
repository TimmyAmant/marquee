import Foundation

// Plex / Jellyfin accounts: linking your own (Settings › Account › Linked
// accounts), importing household members, and the admin's sign-up switch.
// Sign-in itself is `AuthEndpoints.plexStart/plexPoll/jellyfin`.

extension MarqueeAPI {
    struct LinksEndpoints: Sendable {
        let transport: Transport

        /// `POST /me/links/plex/start`: open `authUrl`, then `plexPoll`.
        func plexStart() async throws -> API.PlexSignInStart {
            try await transport.post("/me/links/plex/start", timeout: Timeout.integrations)
        }

        /// `POST /me/links/plex/poll` — one poll: false while pending (202),
        /// true once the Plex account is linked (200). Throws
        /// `MediaSignInError.refused` (403) and `.expired` (410).
        func plexPoll(handle: String) async throws -> Bool {
            let (status, body) = try await transport.exchange(
                .post, "/me/links/plex/poll",
                body: API.PlexLinkPollRequest(handle: handle),
                accepting: PlexPoll.answers,
                timeout: Timeout.integrations
            )
            guard try PlexPoll.step(status: status, body: body) != nil else { return false }
            await transport.record(.users)
            return true
        }

        /// `POST /me/links/jellyfin` — links the Jellyfin account these
        /// credentials sign in to. Errors: `.invalidCredentials`, `.conflict`
        /// (linked to someone else), `MediaSignInError.refused` (403).
        func jellyfin(username: String, password: String) async throws {
            let (status, body) = try await transport.exchange(
                .post, "/me/links/jellyfin",
                body: API.JellyfinLinkRequest(username: username, password: password),
                accepting: [403],
                timeout: Timeout.integrations
            )
            if status == 403 { throw MediaSignInError.refusal(from: body) }
            await transport.record(.users)
        }

        /// `DELETE /me/links/{plex|jellyfin}`. Refused (`.invalid`/`.conflict`)
        /// when it would leave the account with no way to sign in.
        func unlink(_ server: API.MediaServer) async throws {
            let _: EmptyResponse = try await transport.mutate(
                .delete, "/me/links/\(MarqueeAPI.segment(server.rawValue))", changes: .users
            )
        }
    }
}

extension MarqueeAPI.UsersEndpoints {
    /// `GET /users/import/{plex|jellyfin}` (admin) — the Plex users the
    /// server is shared with, or the Jellyfin users.
    func importCandidates(from server: API.MediaServer) async throws -> [API.ImportCandidate] {
        let list: API.ListResponse<API.ImportCandidate> = try await transport.get(
            "/users/import/\(MarqueeAPI.segment(server.rawValue))", timeout: MarqueeAPI.Timeout.integrations
        )
        return list.results
    }

    /// `POST /users/import/{plex|jellyfin}` (admin) — creates linked member
    /// accounts for `ids`.
    func importMembers(from server: API.MediaServer, ids: [API.ExternalID]) async throws -> API.ImportUsersResult {
        try await transport.mutate(
            .post, "/users/import/\(MarqueeAPI.segment(server.rawValue))",
            body: API.ImportUsersRequest(ids: ids), timeout: MarqueeAPI.Timeout.integrations, changes: .users
        )
    }

    /// `GET /settings/sign-in` (admin). `.notFound` from servers without
    /// Plex/Jellyfin sign-in.
    func signInSettings() async throws -> API.SignInSettings {
        try await transport.get("/settings/sign-in")
    }

    /// `PUT /settings/sign-in` (admin). The answer's body isn't needed.
    func saveSignInSettings(_ settings: API.SignInSettings) async throws {
        let _: EmptyResponse = try await transport.mutate(.put, "/settings/sign-in", body: settings, changes: .users)
    }
}
