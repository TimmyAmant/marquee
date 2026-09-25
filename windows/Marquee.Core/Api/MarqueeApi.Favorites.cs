using Marquee.Core.Models;

namespace Marquee.Core.Api;

// Favorites (api-v1.md section 6). Each call returns the entity's favorited
// state after it ran.

public sealed partial class MarqueeApi
{
    public FavoritesEndpoints Favorites => new(transport);
}

public sealed class FavoritesEndpoints(MarqueeApi.Transport transport)
{
    /// <summary><c>GET /favorites</c>: the Favorites page. Collections are fetched live from TMDb, hence the TMDb timeout.</summary>
    public Task<FavoritesResponse> AllAsync(CancellationToken ct = default) =>
        transport.GetAsync<FavoritesResponse>("/favorites", timeout: MarqueeApi.Timeouts.Tmdb, ct: ct);

    /// <summary><c>GET /favorites/{entityType}/{tmdbId}</c>.</summary>
    public async Task<bool> IsFavoritedAsync(FavoriteEntityType type, int tmdbId, CancellationToken ct = default)
    {
        var state = await transport.GetAsync<FavoriteState>(Path(type, tmdbId), ct: ct).ConfigureAwait(false);
        return state.Favorited;
    }

    /// <summary>
    /// <c>PUT /favorites/{entityType}/{tmdbId}</c>: favorite (idempotent).
    /// The server also caches the entity from TMDb so it shows on
    /// <c>GET /favorites</c>, which is why this one gets the TMDb timeout.
    /// </summary>
    public async Task<bool> AddAsync(FavoriteEntityType type, int tmdbId, CancellationToken ct = default)
    {
        var state = await transport.MutateAsync<FavoriteState>(
            HttpMethod.Put, Path(type, tmdbId),
            timeout: MarqueeApi.Timeouts.Tmdb, changes: ServerChange.Favorites, ct: ct).ConfigureAwait(false);
        return state.Favorited;
    }

    /// <summary><c>DELETE /favorites/{entityType}/{tmdbId}</c>: unfavorite (idempotent).</summary>
    public async Task<bool> RemoveAsync(FavoriteEntityType type, int tmdbId, CancellationToken ct = default)
    {
        var state = await transport.MutateAsync<FavoriteState>(
            HttpMethod.Delete, Path(type, tmdbId),
            changes: ServerChange.Favorites, ct: ct).ConfigureAwait(false);
        return state.Favorited;
    }

    /// <summary><c>POST /favorites/{entityType}/{tmdbId}/toggle</c>: the star button. Returns the new state.</summary>
    public async Task<bool> ToggleAsync(FavoriteEntityType type, int tmdbId, CancellationToken ct = default)
    {
        var state = await transport.MutateAsync<FavoriteState>(
            HttpMethod.Post, Path(type, tmdbId) + "/toggle",
            timeout: MarqueeApi.Timeouts.Tmdb, changes: ServerChange.Favorites, ct: ct).ConfigureAwait(false);
        return state.Favorited;
    }

    /// <summary>
    /// <see cref="AddAsync"/> or <see cref="RemoveAsync"/>: sets an explicit
    /// state, so two quick clicks can't toggle each other back.
    /// </summary>
    public Task<bool> SetAsync(bool favorited, FavoriteEntityType type, int tmdbId, CancellationToken ct = default) =>
        favorited ? AddAsync(type, tmdbId, ct) : RemoveAsync(type, tmdbId, ct);

    /// <summary><c>/favorites/{entityType}/{tmdbId}</c>.</summary>
    public static string Path(FavoriteEntityType type, int tmdbId) =>
        $"/favorites/{MarqueeApi.Segment(type)}/{tmdbId}";
}
