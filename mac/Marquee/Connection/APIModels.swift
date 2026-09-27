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
    /// 0.48+: what this account may do (see `can(_:)`); nil from older
    /// servers, which go by the role instead.
    var permissions: API.Permissions? = nil
    /// `/me` only (login's `user` has none): the pre-permissions
    /// auto-approval, for the fallback when `permissions` is missing.
    var autoApproveMovies: Bool? = nil
    var autoApproveTv: Bool? = nil
    /// `/me` only, 0.50+: the language this account reads Marquee in (`en`,
    /// `es`, `fr`, `de`, `pt-BR`), or nil to follow the Mac (`AppLanguage`).
    var language: String? = nil
    /// Whether the server sent `language` at all (even null): an older
    /// server doesn't, and can't store one — Settings hides the picker.
    var sendsLanguage = false

    var isAdmin: Bool { role == .admin }

    enum CodingKeys: String, CodingKey {
        case id, username, displayName, role, libraryOwnerId, avatarUrl, linked, hasPassword
        case permissions, autoApproveMovies, autoApproveTv, language
    }
}

extension User {
    /// Synthesized, except that a present `language: null` is told apart
    /// from no `language` (`sendsLanguage`).
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        username = try container.decode(String.self, forKey: .username)
        displayName = try container.decodeIfPresent(String.self, forKey: .displayName)
        role = try container.decode(API.UserRole.self, forKey: .role)
        libraryOwnerId = try container.decode(UUID.self, forKey: .libraryOwnerId)
        avatarUrl = try container.decodeIfPresent(String.self, forKey: .avatarUrl)
        linked = try container.decodeIfPresent(LinkedAccounts.self, forKey: .linked)
        hasPassword = try container.decodeIfPresent(Bool.self, forKey: .hasPassword)
        permissions = try container.decodeIfPresent(API.Permissions.self, forKey: .permissions)
        autoApproveMovies = try container.decodeIfPresent(Bool.self, forKey: .autoApproveMovies)
        autoApproveTv = try container.decodeIfPresent(Bool.self, forKey: .autoApproveTv)
        sendsLanguage = container.contains(.language)
        language = try container.decodeIfPresent(String.self, forKey: .language)
    }
}

/// `PATCH /me` (0.50+): `{"language": "fr"}`, or `{"language": null}` to
/// follow the device again — null is sent, never left out.
struct MeLanguageUpdate: Encodable, Sendable {
    let language: String?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: User.CodingKeys.self)
        try container.encode(language, forKey: .language)
    }
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
