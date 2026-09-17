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

        /// `POST /auth/logout` — revokes this token only.
        func logout() async throws {
            let _: API.OK = try await transport.mutate(.post, "/auth/logout", changes: [])
        }
    }
}
