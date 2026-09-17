import Foundation

// Settings → Activity (api-v1.md §10).

extension API {
    /// `GET /settings/activity`: one of the 50 most recent request events.
    struct ActivityItem: Codable, Hashable, Sendable, Identifiable {
        let id: UUID
        let eventType: ActivityEventType
        /// "requested", "approved", "declined", "manually approved".
        let verb: String
        let mediaType: MediaType
        let tmdbId: Int
        let title: String
        let actor: RequestPerson
        let createdAt: Date

        /// "{actor} {verb} {title}".
        var sentence: String { "\(actor.label) \(verb) \(title)" }

        var titleID: TitleID { TitleID(mediaType, tmdbId) }
    }
}
