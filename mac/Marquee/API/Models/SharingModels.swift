import Foundation

// Sharing a title (api-v1.md §3 "Share a title", 0.45+): send it to someone
// else in the household, who gets a `title_shared` notification, or share a
// link outside Marquee.

extension API {
    /// Someone a title can be sent to (`GET /users/shareable`), and who sent
    /// one (a notification's `sharedBy`): a `RequestPerson` plus the photo.
    struct ShareableUser: Codable, Hashable, Sendable, Identifiable {
        let userId: UUID
        let displayName: String?
        let username: String
        /// What the website prints: display name, else username.
        let label: String
        /// The profile photo (see `User.avatarUrl`); nil for initials.
        var avatarUrl: String? = nil

        var id: UUID { userId }
    }

    /// `GET /users/shareable`: everyone in the household but you, by name.
    struct ShareableUsers: Codable, Hashable, Sendable {
        let results: [ShareableUser]
        /// Marquee's public address (no trailing slash), for links sent
        /// outside; nil when none is set — then links use the address this
        /// Mac is connected to.
        let publicUrl: String?
    }

    /// `POST /titles/{type}/{tmdbId}/share`'s body.
    struct ShareTitleRequest: Codable, Hashable, Sendable {
        static let maxNoteLength = 280
        static let maxRecipients = 20

        /// Lowercase account ids, the way the server lists them.
        let userIds: [String]
        /// One line of plain text, at most `maxNoteLength` characters; left
        /// out when there's no note.
        var note: String? = nil

        init(userIds: [UUID], note: String? = nil) {
            self.userIds = userIds.map { $0.uuidString.lowercased() }
            self.note = note
        }
    }

    /// `{ "ok": true, "sharedWith": 1 }`.
    struct ShareResult: Codable, Hashable, Sendable {
        let ok: Bool
        /// How many people it went to (repeats dropped).
        let sharedWith: Int
    }
}
