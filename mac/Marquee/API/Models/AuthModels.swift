import Foundation

// Discovery, sign-in, /me and /badges. The core contract types (`User`,
// `ServerInfo`, `AuthTokenResponse`, `LoginRequest`, `SetupRequest`) predate
// this layer and live in Connection/; they're aliased here so view code can
// spell everything `API.…`.

extension API {
    /// Only a plex.tv page over https: the app hands Plex sign-in URLs to
    /// the browser, and a server (or something pretending to be one)
    /// mustn't be able to make it open a file or another app's URL scheme.
    static func plexWebURL(_ string: String) -> URL? {
        guard let url = URL(string: string), url.scheme == "https",
              let host = url.host?.lowercased(), host == "plex.tv" || host.hasSuffix(".plex.tv")
        else { return nil }
        return url
    }

    /// Single sign-on's page (Marquee's own "Continue with {name}?"): only
    /// over https, or on the server's own origin (a home server reached over
    /// plain http). Like `plexWebURL`, never a file, another app's URL
    /// scheme, or plain http anywhere else.
    static func signInPageURL(_ string: String, server: URL?) -> URL? {
        guard let url = URL(string: string), let scheme = url.scheme?.lowercased(),
              let host = url.host, !host.isEmpty
        else { return nil }
        if scheme == "https" { return url }
        guard let server, sameOrigin(url, server) else { return nil }
        return url
    }

    /// Same scheme, host and port (a missing port is the scheme's default).
    static func sameOrigin(_ lhs: URL, _ rhs: URL) -> Bool {
        func origin(_ url: URL) -> (String, String, Int)? {
            guard let scheme = url.scheme?.lowercased(), let host = url.host?.lowercased(), !host.isEmpty else { return nil }
            let port = url.port ?? (scheme == "https" ? 443 : scheme == "http" ? 80 : -1)
            return (scheme, host, port)
        }
        guard let left = origin(lhs), let right = origin(rhs) else { return false }
        return left == right
    }

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
        /// The profile photo (see `User.avatarUrl`).
        var avatarUrl: String? = nil
        let autoApproveMovies: Bool
        let autoApproveTv: Bool
        let createdAt: Date
        /// See `User.linked`; nil from older servers.
        var linked: LinkedAccounts? = nil
        /// See `User.hasPassword`; nil from older servers.
        var hasPassword: Bool? = nil
        /// 0.39+: the account's request limits; nil from older servers.
        var requestLimits: RequestLimits? = nil

        var isAdmin: Bool { role == .admin }
        var canReviewRequests: Bool { role.canReviewRequests }
        /// What the website prints: the display name, else the username.
        var label: String { displayName.nonBlank ?? username }

        var user: User {
            User(
                id: id, username: username, displayName: displayName, role: role,
                libraryOwnerId: libraryOwnerId, avatarUrl: avatarUrl,
                linked: linked, hasPassword: hasPassword
            )
        }
    }

    /// `requestLimits` on `/me` (0.39+): each type is nil when it isn't
    /// limited (always for the admin and trusted members).
    struct RequestLimits: Codable, Hashable, Sendable {
        var movie: RequestLimit?
        var tv: RequestLimit?

        init(movie: RequestLimit? = nil, tv: RequestLimit? = nil) {
            self.movie = movie
            self.tv = tv
        }

        /// The line above a member's requests (app/requests/page.tsx):
        /// "Movies: 3 of 5 requests left (every 7 days) · TV: none left
        /// until Oct 3"; nil when neither type is limited.
        func summaryLine(calendar: Calendar = .current) -> String? {
            let parts = [
                movie.map { $0.line(label: "Movies", calendar: calendar) },
                tv.map { $0.line(label: "TV", calendar: calendar) },
            ].compactMap { $0 }
            return parts.isEmpty ? nil : parts.joined(separator: " · ")
        }
    }

    /// One type's limit: at most `limit` requests in any `days` days.
    struct RequestLimit: Codable, Hashable, Sendable {
        let limit: Int
        let days: Int
        let used: Int
        let remaining: Int
        /// While none is left: when the oldest counted request ages out.
        var nextSlotAt: Date? = nil

        /// The website's `quotaLine`.
        func line(label: String, calendar: Calendar = .current) -> String {
            if remaining > 0 {
                return "\(label): \(remaining) of \(limit) requests left (every \(days) days)"
            }
            guard let nextSlotAt else { return "\(label): none left" }
            // "Oct 3", like the website's toLocaleDateString("en-US", …).
            let style = Date.FormatStyle(locale: Locale(identifier: "en_US"), calendar: calendar, timeZone: calendar.timeZone)
                .month(.abbreviated).day()
            return "\(label): none left until \(nextSlotAt.formatted(style))"
        }
    }

    // MARK: Plex / Jellyfin sign-in

    /// The media servers a Marquee account can sign in with; also the path
    /// segment in `/me/links/{server}` and `/users/import/{server}`.
    enum MediaServer: String, Codable, CaseIterable, Hashable, Sendable, Identifiable {
        case plex
        case jellyfin

        var id: String { rawValue }
        var label: String {
            switch self {
            case .plex: "Plex"
            case .jellyfin: "Jellyfin"
            }
        }
    }

    /// `POST /auth/plex/start` and `/me/links/plex/start`: open `authUrl` in
    /// the browser, then poll with `handle` (never a bare pin id) until
    /// `expiresAt`.
    struct PlexSignInStart: Codable, Hashable, Sendable {
        let handle: String
        let authUrl: String
        let expiresAt: Date

        var url: URL? { API.plexWebURL(authUrl) }
    }

    /// `POST /me/links/plex/poll` body (and `/me/links/sso/poll`'s).
    struct PlexLinkPollRequest: Codable, Hashable, Sendable {
        let handle: String
    }

    // MARK: Single sign-on / Quick Connect (0.44+)

    /// `POST /auth/sso/start` and `/me/links/sso/start`: open `authUrl` in
    /// the browser (only through `url(server:)`), then poll with `handle`
    /// until `expiresAt`.
    struct SsoSignInStart: Codable, Hashable, Sendable {
        let handle: String
        let authUrl: String
        let expiresAt: Date

        /// `authUrl` if it's https or on `server`'s own origin; nil otherwise.
        func url(server: URL?) -> URL? { API.signInPageURL(authUrl, server: server) }
    }

    /// `POST /auth/jellyfin/quick-connect/start`: show `code` for the person
    /// to enter in a Jellyfin app, then poll with `handle` until `expiresAt`.
    struct QuickConnectStart: Codable, Hashable, Sendable {
        let handle: String
        let code: String
        let expiresAt: Date
    }

    /// `GET /settings/sso` (admin): single sign-on with any OpenID Connect
    /// provider. The client secret is never sent back; `hasClientSecret`
    /// says whether one is saved.
    struct SsoSettings: Codable, Hashable, Sendable {
        /// False before it's set up: the rest are the defaults, with
        /// `publicUrl` the address this request came in on.
        var configured: Bool
        /// The button says "Sign in with {name}".
        var name: String
        var issuer: String
        var clientId: String
        var hasClientSecret: Bool
        var scopes: String
        /// Marquee's address as people reach it.
        var publicUrl: String
        /// The redirect URI to register with the provider, exactly.
        var callbackUrl: String
        /// "New accounts from single sign-on".
        var allowSignup: Bool
        /// "Match existing accounts by verified email".
        var matchEmail: Bool
        var requiredGroup: String?
        var trustedGroup: String?
        var groupsClaim: String

        static let defaultScopes = "openid profile email"
        static let defaultGroupsClaim = "groups"
        static let callbackPath = "/api/auth/sso/callback"

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            configured = try c.decodeIfPresent(Bool.self, forKey: .configured) ?? false
            name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
            issuer = try c.decodeIfPresent(String.self, forKey: .issuer) ?? ""
            clientId = try c.decodeIfPresent(String.self, forKey: .clientId) ?? ""
            hasClientSecret = try c.decodeIfPresent(Bool.self, forKey: .hasClientSecret) ?? false
            scopes = try c.decodeIfPresent(String.self, forKey: .scopes).nonBlank ?? Self.defaultScopes
            publicUrl = try c.decodeIfPresent(String.self, forKey: .publicUrl) ?? ""
            callbackUrl = try c.decodeIfPresent(String.self, forKey: .callbackUrl) ?? Self.callbackURL(for: publicUrl)
            allowSignup = try c.decodeIfPresent(Bool.self, forKey: .allowSignup) ?? false
            matchEmail = try c.decodeIfPresent(Bool.self, forKey: .matchEmail) ?? false
            requiredGroup = try c.decodeIfPresent(String.self, forKey: .requiredGroup)
            trustedGroup = try c.decodeIfPresent(String.self, forKey: .trustedGroup)
            groupsClaim = try c.decodeIfPresent(String.self, forKey: .groupsClaim).nonBlank ?? Self.defaultGroupsClaim
        }

        /// The redirect URI for a "Marquee's address" as typed, updated live
        /// like the website's: its origin plus the callback path, or a
        /// placeholder until it's an address.
        static func callbackURL(for publicUrl: String) -> String {
            let trimmed = publicUrl.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let url = URL(string: trimmed), let scheme = url.scheme?.lowercased(),
                  scheme == "http" || scheme == "https",
                  var components = URLComponents(url: url, resolvingAgainstBaseURL: false),
                  let host = components.host, !host.isEmpty
            else { return "https://your-marquee-address\(callbackPath)" }
            components.scheme = scheme
            components.host = host.lowercased()
            components.user = nil
            components.password = nil
            components.query = nil
            components.fragment = nil
            // The scheme's default port is left out, as a URL origin does.
            if components.port == (scheme == "https" ? 443 : 80) { components.port = nil }
            components.path = callbackPath
            return components.string ?? "https://your-marquee-address\(callbackPath)"
        }
    }

    /// `PUT /settings/sso` body: the settings plus the write-only secret.
    struct SsoSettingsRequest: Encodable, Hashable, Sendable {
        var name: String
        var issuer: String
        var clientId: String
        /// Missing (nil) or blank keeps the saved one.
        var clientSecret: String?
        /// True removes the saved secret (a public client); nil sends nothing.
        var clearClientSecret: Bool?
        var scopes: String
        var publicUrl: String
        var allowSignup: Bool
        var matchEmail: Bool
        /// Blank means none.
        var requiredGroup: String?
        var trustedGroup: String?
        var groupsClaim: String
    }

    /// `POST /settings/sso/test` body.
    struct SsoTestRequest: Encodable, Hashable, Sendable {
        let issuer: String
    }

    /// `POST /settings/sso/test`: the provider's discovery document checked
    /// out; `warnings` are things that work but deserve a look.
    struct SsoTestResult: Codable, Hashable, Sendable {
        let issuer: String
        let authorizationEndpoint: String
        let tokenEndpoint: String
        let userinfoEndpoint: String?
        let warnings: [String]

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            issuer = try c.decode(String.self, forKey: .issuer)
            authorizationEndpoint = try c.decode(String.self, forKey: .authorizationEndpoint)
            tokenEndpoint = try c.decode(String.self, forKey: .tokenEndpoint)
            userinfoEndpoint = try c.decodeIfPresent(String.self, forKey: .userinfoEndpoint)
            warnings = try c.decodeIfPresent([String].self, forKey: .warnings) ?? []
        }
    }

    /// `POST /me/links/jellyfin` body.
    struct JellyfinLinkRequest: Codable, Hashable, Sendable {
        let username: String
        let password: String
    }

    /// `GET /me/plex-watchlist`: "Request from my Plex Watchlist", which
    /// requests what this account adds to its own Plex Watchlist.
    struct PlexWatchlist: Codable, Hashable, Sendable {
        /// Plex is linked to this account, so it can be turned on.
        let available: Bool
        let enabled: Bool
        /// Which kinds get requested.
        let movies: Bool
        let tv: Bool
        /// The last successful check; nil before the first.
        let lastSyncedAt: Date?
        /// Why the last check failed, or why it switched itself off.
        let lastError: String?
        let requestedCount: Int

        /// What an older server, without the endpoint (404), amounts to.
        static let unavailable = PlexWatchlist(
            available: false, enabled: false, movies: true, tv: true,
            lastSyncedAt: nil, lastError: nil, requestedCount: 0
        )

        /// plex-watchlist.tsx's status line: "Checked 5m ago · 3 titles
        /// requested so far", or "Checking your watchlist…" before the first.
        func statusLine(now: Date = Date()) -> String {
            var line = lastSyncedAt.map { "Checked \(Format.timeAgo($0, now: now))" } ?? "Checking your watchlist…"
            if requestedCount > 0 {
                line += " · \(requestedCount) \(requestedCount == 1 ? "title" : "titles") requested so far"
            }
            return line
        }
    }

    /// `PATCH /me/plex-watchlist` body: only the kinds being changed.
    struct PlexWatchlistTypes: Codable, Hashable, Sendable {
        var movies: Bool?
        var tv: Bool?
    }

    /// A Plex user id (a number) or a Jellyfin one (a string), sent back to
    /// the server exactly as it came.
    enum ExternalID: Codable, Hashable, Sendable, CustomStringConvertible {
        case string(String)
        case number(Int64)

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let number = try? container.decode(Int64.self) {
                self = .number(number)
            } else {
                self = .string(try container.decode(String.self))
            }
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.singleValueContainer()
            switch self {
            case let .string(value): try container.encode(value)
            case let .number(value): try container.encode(value)
            }
        }

        var description: String {
            switch self {
            case let .string(value): value
            case let .number(value): String(value)
            }
        }
    }

    /// A row in "Import from Plex/Jellyfin" (`GET /users/import/{server}`).
    struct ImportCandidate: Codable, Hashable, Sendable, Identifiable {
        let id: ExternalID
        let username: String
        let displayName: String?
        /// A picture URL on Plex/Jellyfin, when there is one.
        let thumb: String?
        /// Already linked to a Marquee account: shown, not selectable.
        let alreadyMember: Bool

        var label: String { displayName.nonBlank ?? username }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            id = try container.decode(ExternalID.self, forKey: .id)
            username = try container.decode(String.self, forKey: .username)
            displayName = try container.decodeIfPresent(String.self, forKey: .displayName)
            thumb = try container.decodeIfPresent(String.self, forKey: .thumb)
            alreadyMember = try container.decodeIfPresent(Bool.self, forKey: .alreadyMember) ?? false
        }
    }

    /// `POST /users/import/{server}` body.
    struct ImportUsersRequest: Codable, Hashable, Sendable {
        let ids: [ExternalID]
    }

    /// `POST /users/import/{server}` response.
    struct ImportUsersResult: Codable, Hashable, Sendable {
        let created: [HouseholdMember]
        let skipped: Int
    }

    /// `GET`/`PUT /settings/sign-in` (admin).
    struct SignInSettings: Codable, Hashable, Sendable {
        /// "New accounts from Plex/Jellyfin sign-in".
        var mediaServerSignup: Bool
    }

    /// `GET /badges`: the header counters, suited to polling.
    struct Badges: Codable, Hashable, Sendable {
        let unreadNotifications: Int
        /// Always 0 for members.
        let pendingRequests: Int
        /// Open problem reports (0.38+, admin; always 0 for members). nil
        /// from an older server.
        var openIssues: Int? = nil
        /// Requests listed under "Can't find" (0.46+, reviewers; always 0 for
        /// members). nil from an older server.
        var notFoundRequests: Int? = nil
        /// Approved requests listed under "Couldn't add" (0.46+, reviewers;
        /// always 0 for members). nil from an older server.
        var failedRequests: Int? = nil

        static let zero = Badges(unreadNotifications: 0, pendingRequests: 0)

        /// The Requests rail badge: requests, problem reports, "Can't find"
        /// and "Couldn't add" all wait on the Requests page
        /// (components/sidebar.tsx's sum).
        var requestsPageCount: Int {
            pendingRequests + (openIssues ?? 0) + (notFoundRequests ?? 0) + (failedRequests ?? 0)
        }

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
