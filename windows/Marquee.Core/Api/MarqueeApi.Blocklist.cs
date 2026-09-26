using Marquee.Core.Models;

namespace Marquee.Core.Api;

// The request blocklist (api-v1.md section 7, 0.41+), all admin-only.
// Blocking or unblocking changes what title pages offer (viewer.blocked and
// the can-request flags), so every change is recorded as a Library and
// Requests change. An older server answers 404.

public sealed partial class MarqueeApi
{
    public BlocklistEndpoints Blocklist => new(transport);
}

public sealed class BlocklistEndpoints(MarqueeApi.Transport transport)
{
    private const ServerChange Changes = ServerChange.Library | ServerChange.Requests;

    /// <summary>
    /// <c>POST /titles/{type}/{tmdbId}/block</c>: "Block requests". A
    /// <paramref name="reason"/> (up to 200 characters) is sent as
    /// <c>{"reason": …}</c>; without one no body is sent.
    /// </summary>
    public Task BlockTitleAsync(MediaType type, int tmdbId, string? reason = null, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Post, $"{TitlesEndpoints.Path(type, tmdbId)}/block",
            body: reason.NonBlank() is { } text ? new BlockTitleBody(text.Trim()) : null,
            timeout: MarqueeApi.Timeouts.Tmdb, changes: Changes, ct: ct);

    /// <summary><c>DELETE /titles/{type}/{tmdbId}/block</c>: "Unblock requests".</summary>
    public Task UnblockTitleAsync(MediaType type, int tmdbId, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(HttpMethod.Delete, $"{TitlesEndpoints.Path(type, tmdbId)}/block", changes: Changes, ct: ct);

    /// <summary><c>GET /settings/blocklist</c>: keywords first, then titles.</summary>
    public async Task<IReadOnlyList<BlocklistEntry>> ListAsync(CancellationToken ct = default)
    {
        var response = await transport.GetAsync<ListResponse<BlocklistEntry>>("/settings/blocklist", ct: ct).ConfigureAwait(false);
        return response.Results;
    }

    /// <summary>
    /// <c>POST /settings/blocklist</c>: "Block a keyword or genre". Invalid
    /// "Enter a keyword or genre, like anime." A blank reason is left out.
    /// </summary>
    public Task BlockKeywordAsync(string keyword, string? reason = null, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Post, "/settings/blocklist",
            body: new BlockKeywordBody(keyword.Trim(), reason.NonBlank()?.Trim()),
            changes: Changes, ct: ct);

    /// <summary><c>DELETE /settings/blocklist/{id}</c>: "Remove". NotFound "Not on the blocklist."</summary>
    public Task RemoveAsync(Guid id, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(HttpMethod.Delete, $"/settings/blocklist/{MarqueeApi.Segment(id)}", changes: Changes, ct: ct);
}
