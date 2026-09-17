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

    var isAdmin: Bool { role == .admin }
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
