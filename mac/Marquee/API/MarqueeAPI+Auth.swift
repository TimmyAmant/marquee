import Foundation

// Discovery & auth, /me and /badges (api-v1.md §1).

extension MarqueeAPI {
    /// `GET /me` — the account plus its own settings.
    func me() async throws -> API.Me {
        try await transport.get("/me")
    }

    /// `GET /badges` — unread notifications and (admin) pending requests in one cheap call.
    func badges() async throws -> API.Badges {
        try await transport.get("/badges")
    }

    /// Sign-in plumbing. The app signs in through `ServerSession.login` /
    /// `.setup`, which also store the token; these return the raw response.
    struct AuthEndpoints: Sendable {
        let transport: Transport

        /// `GET /server-info` (public).
        func serverInfo() async throws -> API.ServerInfo {
            try await transport.get("/server-info")
        }

        /// `POST /auth/login` (public). Errors: `.invalid`, `.invalidCredentials`, `.rateLimited`.
        func login(username: String, password: String, deviceName: String) async throws -> API.AuthResponse {
            try await transport.post(
                "/auth/login",
                body: LoginRequest(username: username, password: password, deviceName: deviceName)
            )
        }

        /// `POST /auth/setup` (public): the first account, as admin. Errors:
        /// `.setupComplete`, `.rateLimited`, `.invalid`.
        func setup(username: String, password: String, displayName: String = "", deviceName: String) async throws -> API.AuthResponse {
            try await transport.post(
                "/auth/setup",
                body: SetupRequest(username: username, password: password, displayName: displayName, deviceName: deviceName)
            )
        }

        /// `POST /auth/plex/start` (public, rate-limited): open `authUrl` in
        /// the browser, then `plexPoll` with the handle. Offered only when
        /// `server-info.signIn.plex`.
        func plexStart() async throws -> API.PlexSignInStart {
            try await transport.post("/auth/plex/start", timeout: MarqueeAPI.Timeout.integrations)
        }

        /// `POST /auth/plex/poll` — one poll: nil while Plex hasn't said yes
        /// yet (202), the login response once it has (200). Throws
        /// `MediaSignInError.refused` (403, with the server's reason) and
        /// `.expired` (410).
        func plexPoll(handle: String, deviceName: String) async throws -> API.AuthResponse? {
            let (status, body) = try await transport.exchange(
                .post, "/auth/plex/poll",
                body: PlexPollRequest(handle: handle, deviceName: deviceName),
                accepting: PlexPoll.answers,
                timeout: MarqueeAPI.Timeout.integrations
            )
            guard let done = try PlexPoll.step(status: status, body: body) else { return nil }
            return try APIClient.decode(API.AuthResponse.self, from: done, path: "/auth/plex/poll")
        }

        /// `POST /auth/jellyfin` (public, rate-limited): a Jellyfin username
        /// and password, checked by the server against its Jellyfin. Errors:
        /// `.invalidCredentials`, `.rateLimited`, `MediaSignInError.refused` (403).
        func jellyfin(username: String, password: String, deviceName: String) async throws -> API.AuthResponse {
            let (status, body) = try await transport.exchange(
                .post, "/auth/jellyfin",
                body: JellyfinLoginRequest(username: username, password: password, deviceName: deviceName),
                accepting: [403],
                timeout: MarqueeAPI.Timeout.integrations
            )
            if status == 403 { throw MediaSignInError.refusal(from: body) }
            return try APIClient.decode(API.AuthResponse.self, from: body, path: "/auth/jellyfin")
        }

        /// `POST /auth/jellyfin/quick-connect/start` (public, 0.44+): show
        /// `code`, then `quickConnectPoll` with the handle. Offered only when
        /// `server-info.signIn.quickConnect`. `.conflict` when Quick Connect
        /// is off (or the server is Emby).
        func quickConnectStart() async throws -> API.QuickConnectStart {
            try await transport.post("/auth/jellyfin/quick-connect/start", timeout: MarqueeAPI.Timeout.integrations)
        }

        /// `POST /auth/jellyfin/quick-connect/poll` — one poll, exactly like
        /// `plexPoll`; 410 is `MediaSignInError.quickConnectExpired`.
        func quickConnectPoll(handle: String, deviceName: String) async throws -> API.AuthResponse? {
            let path = "/auth/jellyfin/quick-connect/poll"
            let (status, body) = try await transport.exchange(
                .post, path,
                body: PlexPollRequest(handle: handle, deviceName: deviceName),
                accepting: PlexPoll.answers,
                timeout: MarqueeAPI.Timeout.integrations
            )
            guard let done = try PlexPoll.step(status: status, body: body, expired: .quickConnectExpired) else { return nil }
            return try APIClient.decode(API.AuthResponse.self, from: done, path: path)
        }

        /// `POST /auth/sso/start` (public, rate-limited, 0.44+): open
        /// `authUrl` (through `url(server:)`), then `ssoPoll` with the
        /// handle. Offered only when `server-info.signIn.sso` isn't null.
        func ssoStart(deviceName: String) async throws -> API.SsoSignInStart {
            try await transport.post(
                "/auth/sso/start", body: SsoStartRequest(deviceName: deviceName), timeout: MarqueeAPI.Timeout.integrations
            )
        }

        /// `POST /auth/sso/poll` — one poll: nil while the person is still in
        /// the browser (202), the login response once signed in (200).
        /// Throws `MediaSignInError.refused` (403, with the server's reason)
        /// and `.ssoExpired` (410).
        func ssoPoll(handle: String, deviceName: String) async throws -> API.AuthResponse? {
            let (status, body) = try await transport.exchange(
                .post, "/auth/sso/poll",
                body: PlexPollRequest(handle: handle, deviceName: deviceName),
                accepting: PlexPoll.answers,
                timeout: MarqueeAPI.Timeout.integrations
            )
            guard let done = try PlexPoll.step(status: status, body: body, expired: .ssoExpired) else { return nil }
            return try APIClient.decode(API.AuthResponse.self, from: done, path: "/auth/sso/poll")
        }

        /// `POST /auth/logout` — revokes this token only.
        func logout() async throws {
            let _: API.OK = try await transport.mutate(.post, "/auth/logout", changes: [])
        }
    }
}
