import Foundation

// DTOs for the core v1 contract (Docs/API_V1_CORE.md). Keys are the server's
// camelCase names, so no key strategy is needed.

/// `User` from the contract: the signed-in account as `/me` and login return it.
struct User: Codable, Equatable, Hashable, Sendable {
    let id: UUID
    let username: String
    let displayName: String?
    /// Open: a role a newer server adds decodes as `.unknown` instead of
    /// failing sign-in.
    let role: API.UserRole
    /// Whose integrations and library this user sees.
    let libraryOwnerId: UUID
    /// The profile photo as a server-relative path with a `?v=` version
    /// (`/api/v1/users/{id}/avatar?v=…`); nil when there's none, and from
    /// servers older than 0.29.
    var avatarUrl: String? = nil
    /// Which Plex/Jellyfin accounts sign in to this one; nil from servers
    /// that predate Plex/Jellyfin sign-in.
    var linked: LinkedAccounts? = nil
    /// False for an account made by Plex/Jellyfin sign-in or import that
    /// hasn't set a password; nil from older servers (which always have one).
    var hasPassword: Bool? = nil

    var isAdmin: Bool { role == .admin }
    /// Request and problem-report review: the admin or a trusted member.
    var canReviewRequests: Bool { role.canReviewRequests }
}

/// `linked` on `/me` and household members: which media-server accounts
/// (and, 0.44+, the admin's single sign-on) sign in to this Marquee account.
struct LinkedAccounts: Codable, Equatable, Hashable, Sendable {
    var plex: Bool
    var jellyfin: Bool
    /// 0.44+; missing from older servers, which means false.
    var sso: Bool

    init(plex: Bool = false, jellyfin: Bool = false, sso: Bool = false) {
        self.plex = plex
        self.jellyfin = jellyfin
        self.sso = sso
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        plex = (try? container.decodeIfPresent(Bool.self, forKey: .plex)) ?? false
        jellyfin = (try? container.decodeIfPresent(Bool.self, forKey: .jellyfin)) ?? false
        sso = (try? container.decodeIfPresent(Bool.self, forKey: .sso)) ?? false
    }

    func isLinked(_ server: API.MediaServer) -> Bool {
        switch server {
        case .plex: plex
        case .jellyfin: jellyfin
        }
    }
}

/// `POST /api/v1/auth/login` and `/auth/setup` response.
struct AuthTokenResponse: Decodable, Sendable {
    /// `mqt_` + 43 base64url characters.
    let token: String
    let expiresAt: Date
    let user: User
}

struct LoginRequest: Encodable, Sendable {
    let username: String
    let password: String
    let deviceName: String
}

/// `POST /auth/jellyfin`.
struct JellyfinLoginRequest: Encodable, Sendable {
    let username: String
    let password: String
    let deviceName: String
}

/// `POST /auth/plex/poll`, and the SSO and Quick Connect polls.
struct PlexPollRequest: Encodable, Sendable {
    let handle: String
    let deviceName: String
}

/// `POST /auth/sso/start`: the device name is shown on the page the browser opens.
struct SsoStartRequest: Encodable, Sendable {
    let deviceName: String
}

struct SetupRequest: Encodable, Sendable {
    let username: String
    let password: String
    let displayName: String
    let deviceName: String
}

/// `{"ok": true}`
struct OKResponse: Decodable, Sendable {
    let ok: Bool
}

/// For calls whose body the caller doesn't need (or a 204).
struct EmptyResponse: Decodable, Sendable {}

/// `{"page", "totalPages", "totalResults", "results"}`
struct Paginated<Item: Codable & Sendable>: Codable, Sendable {
    let page: Int
    let totalPages: Int
    let totalResults: Int
    let results: [Item]
}
