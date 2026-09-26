import Foundation

// Notifications (api-v1.md §8).

extension API {
    /// `GET /notifications`: the bell's dropdown, newest first.
    struct NotificationList: Codable, Hashable, Sendable {
        let unreadCount: Int
        /// Empty → "No notifications yet."
        let results: [NotificationItem]
    }

    struct NotificationItem: Codable, Hashable, Sendable, Identifiable {
        let id: UUID
        let mediaType: MediaType
        let tmdbId: Int
        let title: String
        let eventType: NotificationEventType
        /// e.g. `"The Matrix" was declined.`
        let message: String
        let read: Bool
        let createdAt: Date
        /// 0.45+ `title_shared`: who shared it. Nil on every other kind, once
        /// that account is removed, and from an older server (which leaves
        /// the field out).
        var sharedBy: ShareableUser? = nil
        /// Their note, if they wrote one; nil like `sharedBy`.
        var note: String? = nil

        /// The system notification's title: "Shared with you" for a share
        /// (the message already names the title), else the title's name.
        var bannerTitle: String {
            eventType == .titleShared ? "Shared with you" : title
        }

        /// A copy marked read (the bell's "Mark all read").
        func markedRead() -> NotificationItem {
            NotificationItem(
                id: id, mediaType: mediaType, tmdbId: tmdbId, title: title, eventType: eventType,
                message: message, read: true, createdAt: createdAt, sharedBy: sharedBy, note: note
            )
        }

        /// Clicking one opens this title and marks it read.
        var titleID: TitleID { TitleID(mediaType, tmdbId) }

        /// "just now", "5m ago", "3h ago", "2d ago".
        func timeAgo(now: Date = Date()) -> String {
            Format.timeAgo(createdAt, now: now)
        }
    }
}
