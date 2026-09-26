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
        /// 0.45+: false when the account turned device push off for this
        /// kind: it's in the bell, but no banner. Missing (an older server)
        /// counts as true.
        var alert: Bool?
        let createdAt: Date

        /// Whether this Mac may show a system banner for it.
        var showsBanner: Bool { alert ?? true }

        /// Clicking one opens this title and marks it read.
        var titleID: TitleID { TitleID(mediaType, tmdbId) }

        /// "just now", "5m ago", "3h ago", "2d ago".
        func timeAgo(now: Date = Date()) -> String {
            Format.timeAgo(createdAt, now: now)
        }
    }
}
