import Foundation

// "The rest of the collection" (api-v1.md, 0.72+): after a movie is added or
// requested, the other movies of its TMDb collection the library doesn't
// have yet, offered in one go.

extension API {
    /// `GET /titles/movie/{tmdbId}/collection-rest`.
    struct CollectionRest: Codable, Hashable, Sendable {
        struct Collection: Codable, Hashable, Sendable {
            let id: Int
            let name: String
        }

        enum Action: String, Codable, Hashable, Sendable {
            /// The admin: straight to Radarr.
            case add
            /// A household member: a request each.
            case request
        }

        /// nil when there's nothing to offer.
        let collection: Collection?
        let action: Action
        let items: [TitleCard]
    }

    /// `POST /titles/movie/{tmdbId}/collection-rest`.
    struct CollectionRestResult: Codable, Hashable, Sendable {
        struct Failure: Codable, Hashable, Sendable {
            let tmdbId: Int
            let title: String
            let error: String
        }

        let ok: Bool
        let action: CollectionRest.Action
        let total: Int
        /// Added or requested.
        let done: Int
        let failed: [Failure]
        /// "Added all 2." / "Requested 1 of 2. …"
        let message: String
    }
}
