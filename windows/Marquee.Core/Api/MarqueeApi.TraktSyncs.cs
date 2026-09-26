using Marquee.Core.Models;

namespace Marquee.Core.Api;

// "Trakt lists" (api-v1.md section 11, 0.49+): keep a public Trakt watchlist
// or list in sync, for every account on Settings › Account; the admin also
// sees everyone's (?all=true). Your own only (the admin: anyone's); someone
// else's is 404. An older server answers 404 on the list and the card stays
// hidden.

public sealed partial class MarqueeApi
{
    public TraktSyncsEndpoints TraktSyncs => new(transport);
}

public sealed class TraktSyncsEndpoints(MarqueeApi.Transport transport)
{
    private const string Path = "/trakt-syncs";

    /// <summary>
    /// <c>GET /trakt-syncs</c>, with <c>?all=true</c> for the admin's view of
    /// everyone's (Forbidden for anyone else). Null from a server older than
    /// 0.49, which answers 404: the card stays hidden.
    /// </summary>
    public async Task<TraktSyncs?> ListAsync(bool all = false, CancellationToken ct = default)
    {
        try
        {
            return await transport.GetAsync<TraktSyncs>(
                Path,
                all ? new Dictionary<string, string?> { ["all"] = "true" } : null,
                ct: ct).ConfigureAwait(false);
        }
        catch (ApiException error) when (error.Kind == ApiErrorKind.NotFound)
        {
            return null;
        }
    }

    /// <summary>
    /// <c>POST /trakt-syncs</c>: the list is read from Trakt once straight
    /// away, so a private or mistyped one is refused (Invalid, Upstream).
    /// Conflict "Trakt isn't connected…", "You're already keeping that list
    /// in sync." or the limit; Forbidden when the account may request nothing.
    /// </summary>
    public Task<TraktSync> AddAsync(NewTraktSyncRequest request, CancellationToken ct = default) =>
        transport.MutateAsync<TraktSync>(
            HttpMethod.Post, Path, body: request with { Url = request.Url.Trim() },
            timeout: MarqueeApi.Timeouts.Integrations, changes: ServerChange.Requests, ct: ct);

    /// <summary><c>PATCH /trakt-syncs/{id}</c>: which kinds are requested; a null one is left as it is (not both off).</summary>
    public Task<TraktSync> SetTypesAsync(Guid id, bool? movies, bool? tv, CancellationToken ct = default) =>
        transport.MutateAsync<TraktSync>(HttpMethod.Patch, $"{Path}/{MarqueeApi.Segment(id)}", body: new TraktSyncTypesRequest(movies, tv), ct: ct);

    /// <summary>
    /// <c>POST /trakt-syncs/{id}/sync</c>: "Check now", answering once the
    /// check is done. RateLimited "Checked a moment ago. Try again in a
    /// minute." after 5 in 5 minutes.
    /// </summary>
    public Task<TraktSync> SyncAsync(Guid id, CancellationToken ct = default) =>
        transport.MutateAsync<TraktSync>(
            HttpMethod.Post, $"{Path}/{MarqueeApi.Segment(id)}/sync",
            timeout: MarqueeApi.Timeouts.LongRunning, changes: ServerChange.Requests, ct: ct);

    /// <summary><c>DELETE /trakt-syncs/{id}</c>: stops syncing; what it requested stays.</summary>
    public Task RemoveAsync(Guid id, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(HttpMethod.Delete, $"{Path}/{MarqueeApi.Segment(id)}", ct: ct);
}
