using Marquee.Core.Models;

namespace Marquee.Core.Api;

// Settings › Discover (api-v1.md section 2, admin, 0.49+): the household's
// Discover rows in order, shown or hidden, and the admin's own rows. Every
// change is a Settings change that reshapes Discover, recorded as
// ServerChange.Integrations (what Discover reloads on). A member gets 403,
// an older server 404.

public sealed partial class MarqueeApi
{
    public DiscoverSettingsEndpoints DiscoverSettings => new(transport);
}

public sealed class DiscoverSettingsEndpoints(MarqueeApi.Transport transport)
{
    private const string Path = "/settings/discover";
    private const ServerChange Changes = ServerChange.Integrations;

    /// <summary>
    /// <c>GET /settings/discover</c>: every row in order, hidden ones
    /// included. Null from a server older than 0.49, which answers 404: the
    /// tab stays hidden.
    /// </summary>
    public async Task<DiscoverSettings?> GetAsync(CancellationToken ct = default)
    {
        try
        {
            return await transport.GetAsync<DiscoverSettings>(Path, ct: ct).ConfigureAwait(false);
        }
        catch (ApiException error) when (error.Kind == ApiErrorKind.NotFound)
        {
            return null;
        }
    }

    /// <summary>
    /// <c>PUT /settings/discover</c>: the rows in their new order, each shown
    /// or hidden. Invalid "There's no Discover row "…". Reload and try again.".
    /// </summary>
    public Task<DiscoverSettings> SaveLayoutAsync(DiscoverLayoutRequest layout, CancellationToken ct = default) =>
        transport.MutateAsync<DiscoverSettings>(HttpMethod.Put, Path, body: layout, changes: Changes, ct: ct);

    /// <summary>
    /// <c>POST /settings/discover/shelves</c>: a row of the admin's own, at
    /// the end, shown. Invalid for a bad field ("Pick a keyword."), Conflict
    /// at 30 rows, Upstream without TMDb (except a library row).
    /// </summary>
    public Task<DiscoverShelfSetting> AddShelfAsync(NewDiscoverShelfRequest request, CancellationToken ct = default) =>
        transport.MutateAsync<DiscoverShelfSetting>(
            HttpMethod.Post, Path + "/shelves", body: request,
            timeout: MarqueeApi.Timeouts.Tmdb, changes: Changes, ct: ct);

    /// <summary>
    /// <c>PATCH /settings/discover/shelves/{id}</c>: show or hide any row,
    /// rename a custom one. Invalid "A built-in row can only be shown or
    /// hidden."; NotFound for an unknown id.
    /// </summary>
    public Task<DiscoverShelfSetting> UpdateShelfAsync(string id, DiscoverShelfPatch patch, CancellationToken ct = default) =>
        transport.MutateAsync<DiscoverShelfSetting>(
            HttpMethod.Patch, $"{Path}/shelves/{MarqueeApi.Segment(id)}", body: patch, changes: Changes, ct: ct);

    /// <summary>
    /// <c>DELETE /settings/discover/shelves/{id}</c>: removes a custom row.
    /// Invalid "A built-in row can't be removed. Hide it instead.".
    /// </summary>
    public Task RemoveShelfAsync(string id, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(HttpMethod.Delete, $"{Path}/shelves/{MarqueeApi.Segment(id)}", changes: Changes, ct: ct);

    /// <summary><c>POST /settings/discover/reset</c>: the built-in rows back in order, all shown; custom rows stay, after them.</summary>
    public Task<DiscoverSettings> ResetAsync(CancellationToken ct = default) =>
        transport.MutateAsync<DiscoverSettings>(HttpMethod.Post, Path + "/reset", changes: Changes, ct: ct);

    /// <summary>
    /// <c>GET /settings/discover/lookup?type=&amp;q=</c>: keywords or studios
    /// (TMDb search; an empty query gives none), networks, or a media type's
    /// genres (<paramref name="mediaType"/> <c>movie</c> or <c>tv</c>, genre only).
    /// </summary>
    public Task<IReadOnlyList<DiscoverLookupResult>> LookupAsync(
        DiscoverLookupKind type,
        string? query,
        ShelfMediaType? mediaType = null,
        CancellationToken ct = default) =>
        transport.GetListAsync<DiscoverLookupResult>(
            Path + "/lookup",
            new Dictionary<string, string?>
            {
                ["type"] = type.Value,
                ["q"] = query?.Trim() ?? "",
                ["mediaType"] = type == DiscoverLookupKind.Genre ? mediaType?.Value : null,
            },
            MarqueeApi.Timeouts.Tmdb,
            ct);
}
