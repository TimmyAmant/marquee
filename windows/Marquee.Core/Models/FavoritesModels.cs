namespace Marquee.Core.Models;

// Favorites (api-v1.md section 6). The entity type on the wire is the
// FavoriteEntityType open enum in OpenEnum.cs; the cards (TitleCard,
// PersonCard, CompanyCard) are the shared shapes in DiscoverModels.cs.

/// <summary>
/// <c>GET /favorites</c>: most recently favorited first within each section.
/// Website section order: Movies, TV Shows, Collections, People, Studios.
/// </summary>
public sealed record FavoritesResponse
{
    public required IReadOnlyList<TitleCard> Movies { get; init; }
    public required IReadOnlyList<TitleCard> Tv { get; init; }

    /// <summary>Fetched live from TMDb; one that fails is omitted.</summary>
    public required IReadOnlyList<FavoriteCollection> Collections { get; init; }

    public required IReadOnlyList<PersonCard> People { get; init; }
    public required IReadOnlyList<CompanyCard> Studios { get; init; }

    /// <summary>
    /// Every section empty: the website shows "Nothing favorited yet" with
    /// the hint to star anything from its page or card.
    /// </summary>
    public bool IsEmpty =>
        Movies.Count == 0 && Tv.Count == 0 && Collections.Count == 0 && People.Count == 0 && Studios.Count == 0;
}

/// <summary>A favorited TMDb collection. The card opens its earliest movie.</summary>
public sealed record FavoriteCollection
{
    public required int CollectionId { get; init; }
    public required string Name { get; init; }
    public ImageRef? PosterPath { get; init; }

    /// <summary>Null when the collection has no movies.</summary>
    public int? FirstMovieTmdbId { get; init; }

    public int Id => CollectionId;
}

/// <summary><c>GET</c>/<c>PUT</c>/<c>DELETE /favorites/{entityType}/{tmdbId}</c> and <c>.../toggle</c>.</summary>
public sealed record FavoriteState
{
    public required FavoriteEntityType EntityType { get; init; }
    public required int TmdbId { get; init; }
    public required bool Favorited { get; init; }
}
