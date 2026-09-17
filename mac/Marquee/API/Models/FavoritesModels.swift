import Foundation

// Favorites (api-v1.md §6).

extension API {
    /// `GET /favorites`: most recently favorited first within each section.
    /// Website section order: Movies, TV Shows, Collections, People, Studios.
    struct FavoritesResponse: Codable, Hashable, Sendable {
        let movies: [TitleCard]
        let tv: [TitleCard]
        /// Fetched live from TMDb; one that fails is omitted.
        let collections: [FavoriteCollection]
        let people: [PersonCard]
        let studios: [CompanyCard]

        /// "Nothing favorited yet — star anything from its page or card to see it here."
        var isEmpty: Bool {
            movies.isEmpty && tv.isEmpty && collections.isEmpty && people.isEmpty && studios.isEmpty
        }
    }

    /// A favorited TMDb collection. The card opens its earliest movie.
    struct FavoriteCollection: Codable, Hashable, Sendable, Identifiable {
        let collectionId: Int
        let name: String
        let posterPath: ImageRef?
        /// nil when the collection has no movies.
        let firstMovieTmdbId: Int?

        var id: Int { collectionId }
    }

    /// `GET`/`PUT`/`DELETE /favorites/{entityType}/{tmdbId}` and `…/toggle`.
    struct FavoriteState: Codable, Hashable, Sendable {
        let entityType: FavoriteEntityType
        let tmdbId: Int
        let favorited: Bool
    }
}
