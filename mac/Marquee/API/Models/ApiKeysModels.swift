import Foundation

// API keys and dashboard counts (api-v1.md §16, 0.47+): keys the admin issues
// for Homepage, Homarr, scripts and other apps, and `GET /stats/summary` for
// their widgets. A server older than 0.47 answers 404 on all of it.

extension API {
    enum ApiKeyScope: OpenEnum {
        /// `GET` (and `POST /surprise`) only.
        case read
        /// Whatever the account may do.
        case full
        case unknown(String)

        static let knownCases: [ApiKeyScope] = [.read, .full]

        var rawValue: String {
            switch self {
            case .read: return "read"
            case .full: return "full"
            case let .unknown(raw): return raw
            }
        }

        /// "Read-only" / "Full access", as the website shows it.
        var label: String {
            switch self {
            case .read: return "Read-only"
            case .full: return "Full access"
            case let .unknown(raw): return raw.capitalized
            }
        }
    }

    /// One row of `GET /settings/api-keys` (oldest first). The secret itself
    /// is never sent again after `POST` — only `hint`, its first 7 characters.
    struct ApiKey: Codable, Hashable, Sendable, Identifiable {
        let id: String
        let name: String
        let scope: ApiKeyScope
        /// The household member the key signs in as; nil for the admin.
        let actAs: RequestPerson?
        /// "mq_Q2xp".
        let hint: String
        let createdAt: Date
        let lastUsedAt: Date?
        /// nil: never expires.
        let expiresAt: Date?
        let expired: Bool
    }

    /// `POST /settings/api-keys`' answer: the secret, shown once.
    struct ApiKeyCreated: Codable, Hashable, Sendable {
        /// "mq_" and 43 base64url characters.
        let key: String
        let apiKey: ApiKey
    }

    /// `POST /settings/api-keys` body. nil `actAsUserId` / `expiresInDays`
    /// send no key: the admin, and never expires.
    struct CreateApiKeyRequest: Codable, Hashable, Sendable {
        let name: String
        let scope: ApiKeyScope
        var actAsUserId: String? = nil
        /// 1–3650.
        var expiresInDays: Int? = nil

        /// The server's limit on `name`.
        static let maxNameLength = 80
    }

    /// `GET /stats/summary`: a few counts for dashboard widgets.
    struct StatsSummary: Codable, Hashable, Sendable {
        /// 0 for an account that doesn't review requests (as `/badges`).
        let pendingRequests: Int
        let openIssues: Int
        /// Approved requests Sonarr/Radarr can't find.
        let cantFind: Int
        /// Titles in the household library.
        let movies: Int
        let series: Int
        /// Titles Sonarr/Radarr are downloading now.
        let downloading: Int
    }
}
