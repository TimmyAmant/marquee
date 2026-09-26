import Foundation

// Settings → Account: household members (api-v1.md §11).

extension API {
    /// A row in "Household members" (admin) or "Your account" (member).
    struct HouseholdMember: Codable, Hashable, Sendable, Identifiable {
        let id: UUID
        let username: String
        let displayName: String?
        /// The "Admin" badge.
        let role: UserRole
        let autoApproveMovies: Bool
        let autoApproveTv: Bool
        let createdAt: Date
        /// The "You" badge.
        let isCurrentUser: Bool
        /// The profile photo (see `User.avatarUrl`).
        var avatarUrl: String? = nil
        /// The "Plex" / "Jellyfin" tags; nil from older servers.
        var linked: LinkedAccounts? = nil
        /// See `User.hasPassword`; nil from older servers.
        var hasPassword: Bool? = nil
        /// When the account last used the website or an app (to within
        /// 5 minutes); nil when it never has, or from an older server.
        var lastActiveAt: Date? = nil
        /// Whether the server sent `lastActiveAt` at all (even as null). An
        /// older server omits it, and then the row shows no "last active" line.
        var reportsLastActive: Bool = false
        /// 0.39+: at most `movieQuotaLimit` movie requests in any
        /// `movieQuotaDays` days; a nil limit is no limit. The days are nil
        /// from older servers (see `reportsRequestLimits`).
        var movieQuotaLimit: Int? = nil
        var movieQuotaDays: Int? = nil
        var tvQuotaLimit: Int? = nil
        var tvQuotaDays: Int? = nil

        var isAdmin: Bool { role == .admin }
        /// The "Trusted" tag.
        var isTrusted: Bool { role == .trusted }
        /// Whether the server has request limits and the trusted role
        /// (0.39+), so the edit sheet can offer them.
        var reportsRequestLimits: Bool { movieQuotaDays != nil || tvQuotaDays != nil }
        var label: String { displayName.nonBlank ?? username }

        /// The muted "Active 3 hours ago" line; nil from an older server.
        func lastActiveLine(now: Date = Date()) -> String? {
            reportsLastActive ? lastActiveLabel(lastActiveAt, now: now) : nil
        }

        private enum CodingKeys: String, CodingKey {
            case id, username, displayName, role, autoApproveMovies, autoApproveTv, createdAt
            case isCurrentUser, avatarUrl, linked, hasPassword, lastActiveAt
            case movieQuotaLimit, movieQuotaDays, tvQuotaLimit, tvQuotaDays
        }
    }
}

extension API.HouseholdMember {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        username = try c.decode(String.self, forKey: .username)
        displayName = try c.decodeIfPresent(String.self, forKey: .displayName)
        role = try c.decode(API.UserRole.self, forKey: .role)
        autoApproveMovies = try c.decode(Bool.self, forKey: .autoApproveMovies)
        autoApproveTv = try c.decode(Bool.self, forKey: .autoApproveTv)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        isCurrentUser = try c.decode(Bool.self, forKey: .isCurrentUser)
        avatarUrl = try c.decodeIfPresent(String.self, forKey: .avatarUrl)
        linked = try c.decodeIfPresent(LinkedAccounts.self, forKey: .linked)
        hasPassword = try c.decodeIfPresent(Bool.self, forKey: .hasPassword)
        lastActiveAt = try c.decodeIfPresent(Date.self, forKey: .lastActiveAt)
        reportsLastActive = c.contains(.lastActiveAt)
        movieQuotaLimit = try c.decodeIfPresent(Int.self, forKey: .movieQuotaLimit)
        movieQuotaDays = try c.decodeIfPresent(Int.self, forKey: .movieQuotaDays)
        tvQuotaLimit = try c.decodeIfPresent(Int.self, forKey: .tvQuotaLimit)
        tvQuotaDays = try c.decodeIfPresent(Int.self, forKey: .tvQuotaDays)
    }
}

extension API {
    /// `PUT` and `DELETE /users/{id}/avatar`: where the photo is now (nil once removed).
    struct AvatarResult: Codable, Hashable, Sendable {
        let ok: Bool
        let avatarUrl: String?
    }

    /// `POST /users` body ("Add a household member").
    struct CreateUserRequest: Encodable, Hashable, Sendable {
        /// 3–32 characters: letters, numbers, `_ . -`; unique.
        var username: String
        /// At least 8 characters.
        var password: String
        /// Optional, 1–80 characters.
        var displayName: String?

        init(username: String, password: String, displayName: String? = nil) {
            self.username = username
            self.password = password
            self.displayName = displayName
        }
    }

    /// `PATCH /users/{id}` body, sent the way the website's edit form sends it.
    struct UpdateUserRequest: Encodable, Hashable, Sendable {
        /// Required (3–32 characters, unique).
        var username: String
        /// ≤ 80 characters; nil or empty leaves it unchanged.
        var displayName: String?
        /// ≥ 8 characters; nil or empty leaves it unchanged. Setting one
        /// revokes every token of the account, including this Mac's when
        /// editing yourself (deviation 5).
        var password: String?
        /// Required alongside `password` when editing your own account;
        /// the admin resetting someone else's password doesn't send it.
        var currentPassword: String?
        /// Admin only (ignored for members); nil leaves it unchanged. Shown only for non-admin rows.
        var autoApproveMovies: Bool?
        var autoApproveTv: Bool?
        /// 0.39+, admin only, another member's account: `.member` or
        /// `.trusted`; nil leaves it unchanged.
        var role: UserRole?
        /// 0.39+, admin only: each type's request limit; nil leaves both
        /// the limit and its days unchanged.
        var movieQuota: QuotaChange?
        var tvQuota: QuotaChange?

        init(
            username: String,
            displayName: String? = nil,
            password: String? = nil,
            currentPassword: String? = nil,
            autoApproveMovies: Bool? = nil,
            autoApproveTv: Bool? = nil,
            role: UserRole? = nil,
            movieQuota: QuotaChange? = nil,
            tvQuota: QuotaChange? = nil
        ) {
            self.username = username
            self.displayName = displayName
            self.password = password
            self.currentPassword = currentPassword
            self.autoApproveMovies = autoApproveMovies
            self.autoApproveTv = autoApproveTv
            self.role = role
            self.movieQuota = movieQuota
            self.tvQuota = tvQuota
        }

        /// A new request limit for one type.
        struct QuotaChange: Hashable, Sendable {
            /// 1–1000; nil removes the limit (sent as `null`).
            var limit: Int?
            /// 1–365.
            var days: Int

            init(limit: Int?, days: Int) {
                self.limit = limit
                self.days = days
            }

            /// From the sheet's fields: a blank limit is no limit. nil when
            /// either isn't a whole number.
            init?(limitText: String, daysText: String) {
                let limitText = limitText.trimmingCharacters(in: .whitespacesAndNewlines)
                guard let days = Int(daysText.trimmingCharacters(in: .whitespacesAndNewlines)) else { return nil }
                if limitText.isEmpty {
                    self.init(limit: nil, days: days)
                } else if let limit = Int(limitText) {
                    self.init(limit: limit, days: days)
                } else {
                    return nil
                }
            }
        }

        private enum CodingKeys: String, CodingKey {
            case username, displayName, password, currentPassword, autoApproveMovies, autoApproveTv
            case role, movieQuotaLimit, movieQuotaDays, tvQuotaLimit, tvQuotaDays
        }

        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(username, forKey: .username)
            try c.encodeIfPresent(displayName, forKey: .displayName)
            try c.encodeIfPresent(password, forKey: .password)
            try c.encodeIfPresent(currentPassword, forKey: .currentPassword)
            try c.encodeIfPresent(autoApproveMovies, forKey: .autoApproveMovies)
            try c.encodeIfPresent(autoApproveTv, forKey: .autoApproveTv)
            try c.encodeIfPresent(role, forKey: .role)
            // A limit that's being changed is always sent, `null` to remove
            // it; an untouched one is omitted (unchanged).
            if let movieQuota {
                try c.encode(movieQuota.limit, forKey: .movieQuotaLimit)
                try c.encode(movieQuota.days, forKey: .movieQuotaDays)
            }
            if let tvQuota {
                try c.encode(tvQuota.limit, forKey: .tvQuotaLimit)
                try c.encode(tvQuota.days, forKey: .tvQuotaDays)
            }
        }
    }

    /// `PATCH /users/{id}` response.
    struct UpdateUserResult: Codable, Hashable, Sendable {
        let ok: Bool
        let user: HouseholdMember
        /// A password was set: every token of that account is gone. If it
        /// was your own account, sign in again.
        let tokensRevoked: Bool
    }
}
