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

        var isAdmin: Bool { role == .admin }
        var label: String { displayName.nonBlank ?? username }
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

        init(
            username: String,
            displayName: String? = nil,
            password: String? = nil,
            currentPassword: String? = nil,
            autoApproveMovies: Bool? = nil,
            autoApproveTv: Bool? = nil
        ) {
            self.username = username
            self.displayName = displayName
            self.password = password
            self.currentPassword = currentPassword
            self.autoApproveMovies = autoApproveMovies
            self.autoApproveTv = autoApproveTv
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
