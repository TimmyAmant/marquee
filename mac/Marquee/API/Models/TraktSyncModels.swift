import Foundation

// "Keep in sync" with a public Trakt watchlist or list (api-v1.md §11,
// 0.49+): Settings › Account's "Trakt lists" card, for every account. New
// titles on the list are requested as its owner every few hours (the
// `trakt-sync` job). A server older than 0.49 answers 404.

extension API {
    enum TraktSyncKind: OpenEnum {
        case watchlist
        case list
        case unknown(String)

        static let knownCases: [TraktSyncKind] = [.watchlist, .list]

        var rawValue: String {
            switch self {
            case .watchlist: return "watchlist"
            case .list: return "list"
            case let .unknown(raw): return raw
            }
        }
    }

    /// One synced list.
    struct TraktSync: Codable, Hashable, Sendable, Identifiable {
        struct Owner: Codable, Hashable, Sendable {
            let id: UUID
            let username: String
            let displayName: String?

            /// What the website prints: display name, else username.
            var label: String { displayName.nonBlank ?? username }
        }

        let id: String
        let kind: TraktSyncKind
        /// The list's link on trakt.tv.
        let url: String
        /// "someone's watchlist", or the list's name from its link.
        let name: String
        /// Which kinds are requested.
        let movies: Bool
        let tv: Bool
        /// The last successful check.
        let lastSyncedAt: Date?
        let lastError: String?
        /// Titles requested from this list so far.
        let requestedCount: Int
        let createdAt: Date
        /// Whose it is.
        let owner: Owner?
    }

    /// `GET /trakt-syncs`.
    struct TraktSyncs: Codable, Hashable, Sendable {
        let results: [TraktSync]
        /// Trakt is connected (Settings › Integrations); without it syncs
        /// can't be added and existing ones pause.
        let available: Bool
        let maxPerMember: Int
    }

    /// `POST /trakt-syncs` body.
    struct CreateTraktSyncRequest: Codable, Hashable, Sendable {
        let url: String
        let movies: Bool
        let tv: Bool
        /// Also request what's on it now; false: only titles added from now on.
        let requestExisting: Bool
    }

    /// `PATCH /trakt-syncs/{id}` body: only the kinds being changed.
    struct UpdateTraktSyncRequest: Codable, Hashable, Sendable {
        var movies: Bool?
        var tv: Bool?
    }
}
