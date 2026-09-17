import Foundation

// Discovery, sign-in, /me and /badges. The core contract types (`User`,
// `ServerInfo`, `AuthTokenResponse`, `LoginRequest`, `SetupRequest`) predate
// this layer and live in Connection/; they're aliased here so view code can
// spell everything `API.…`.

extension API {
    typealias User = Marquee.User
    typealias ServerInfo = Marquee.ServerInfo
    /// `POST /auth/login` and `/auth/setup`.
    typealias AuthResponse = AuthTokenResponse
    /// `{"ok": true}`
    typealias OK = OKResponse

    /// `GET /me`: the `User` plus the account's own settings.
    struct Me: Codable, Hashable, Sendable {
        let id: UUID
        let username: String
        let displayName: String?
        let role: UserRole
        let libraryOwnerId: UUID
        let autoApproveMovies: Bool
        let autoApproveTv: Bool
        let createdAt: Date

        var isAdmin: Bool { role == .admin }
        /// What the website prints: the display name, else the username.
        var label: String { displayName.nonBlank ?? username }

        var user: User {
            User(id: id, username: username, displayName: displayName, role: role, libraryOwnerId: libraryOwnerId)
        }
    }

    /// `GET /badges`: the header counters, suited to polling.
    struct Badges: Codable, Hashable, Sendable {
        let unreadNotifications: Int
        /// Always 0 for members.
        let pendingRequests: Int

        static let zero = Badges(unreadNotifications: 0, pendingRequests: 0)

        /// The bell's cap on the website: "9+".
        var bellLabel: String? {
            unreadNotifications > 0 ? (unreadNotifications > 9 ? "9+" : "\(unreadNotifications)") : nil
        }

        /// The Dock tile's label: "99+".
        var dockLabel: String? {
            unreadNotifications > 0 ? (unreadNotifications > 99 ? "99+" : "\(unreadNotifications)") : nil
        }
    }

    /// `{"count": 3}` from `/requests/pending-count` and `/notifications/unread-count`.
    struct Count: Codable, Hashable, Sendable {
        let count: Int
    }

    /// `{"results": [...]}`: the lists the website shows whole (deviation 6).
    struct ListResponse<Item: Codable & Sendable>: Codable, Sendable {
        let results: [Item]
    }

    /// A movie or TV title's identity: `{"mediaType", "tmdbId"}` on the wire
    /// (`POST /surprise`, a franchise's `addAllMissing`).
    struct TitleID: Codable, Hashable, Sendable, CustomStringConvertible {
        let mediaType: MediaType
        let tmdbId: Int

        init(_ mediaType: MediaType, _ tmdbId: Int) {
            self.mediaType = mediaType
            self.tmdbId = tmdbId
        }

        /// `"movie:603"`, the website's status-map key.
        var description: String { "\(mediaType.rawValue):\(tmdbId)" }

        /// `marquee://title/movie/603`, what AppModel.handle(url:) and
        /// notification banners route with.
        var route: URL {
            URL(string: "marquee://title/\(mediaType.rawValue)/\(tmdbId)")!
        }
    }
}

extension User {
    /// What the website prints: the display name, else the username.
    var label: String { displayName.nonBlank ?? username }
}

extension String {
    /// nil when empty or whitespace-only.
    var nonBlank: String? {
        trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : self
    }
}

extension Optional where Wrapped == String {
    /// nil for nil, empty or whitespace-only.
    var nonBlank: String? {
        self?.nonBlank
    }
}
