using Marquee.Core.Models;

namespace Marquee.Core.Api;

// Requests (api-v1.md section 7). Members see MineAsync; the admin reviews
// PendingAsync and HistoryAsync. Requesting a title itself is
// POST /titles/{type}/{tmdbId}/request, which lives with the title
// endpoints.

public sealed partial class MarqueeApi
{
    public RequestsEndpoints Requests => new(transport);
}

public sealed class RequestsEndpoints(MarqueeApi.Transport transport)
{
    /// <summary>
    /// <c>GET /requests/mine</c>: your own requests, newest first. Empty:
    /// "You haven't requested anything yet", with the hint to find a title
    /// and hit Request. The server checks each approved title's live
    /// library status, so it gets the integrations timeout.
    /// </summary>
    public Task<IReadOnlyList<MyRequest>> MineAsync(CancellationToken ct = default) =>
        transport.GetListAsync<MyRequest>("/requests/mine", timeout: MarqueeApi.Timeouts.Integrations, ct: ct);

    /// <summary>
    /// <c>GET /requests/pending</c> (admin): the review queue. Loading it
    /// first auto-approves pending requests whose title is already in the
    /// library, which is why it gets the integrations timeout.
    /// </summary>
    public Task<PendingRequests> PendingAsync(CancellationToken ct = default) =>
        transport.GetAsync<PendingRequests>("/requests/pending", timeout: MarqueeApi.Timeouts.Integrations, ct: ct);

    /// <summary><c>GET /requests/history</c> (admin): "Past requests".</summary>
    public Task<IReadOnlyList<ReviewedRequest>> HistoryAsync(CancellationToken ct = default) =>
        transport.GetListAsync<ReviewedRequest>("/requests/history", ct: ct);

    /// <summary><c>GET /requests/pending-count</c>: always 0 for members (<c>BadgesAsync</c> has it too).</summary>
    public async Task<int> PendingCountAsync(CancellationToken ct = default)
    {
        var count = await transport.GetAsync<CountResponse>("/requests/pending-count", ct: ct).ConfigureAwait(false);
        return count.Count;
    }

    /// <summary>
    /// <c>POST /requests/{id}/approve</c> (admin): adds with the admin's
    /// Radarr/Sonarr and notifies the requester. On a TV request,
    /// <c>error.IsSonarrUnresolvable</c> means: offer <see cref="ManuallyApproveAsync"/>.
    /// </summary>
    public Task ApproveAsync(Guid id, CancellationToken ct = default) =>
        ApproveAsync(id, null, ct);

    /// <summary>
    /// <c>POST /requests/{id}/approve</c> with the "Advanced" picks (0.43+,
    /// admin or trusted): which server, quality profile, root folder, tags
    /// and (TV) series type. Null <paramref name="overrides"/> sends no body
    /// at all, the plain Approve every server version takes. Extra error:
    /// Invalid("That server can't take this request.").
    /// </summary>
    public Task ApproveAsync(Guid id, AddOverrides? overrides, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Post, $"/requests/{MarqueeApi.Segment(id)}/approve",
            body: overrides,
            timeout: MarqueeApi.Timeouts.Integrations,
            changes: ServerChange.Requests | ServerChange.Library | ServerChange.Notifications, ct: ct);

    /// <summary><c>POST /requests/{id}/manual-approve</c> (admin): approved without touching Sonarr/Radarr.</summary>
    public Task ManuallyApproveAsync(Guid id, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Post, $"/requests/{MarqueeApi.Segment(id)}/manual-approve",
            changes: ServerChange.Requests | ServerChange.Notifications, ct: ct);

    /// <summary>
    /// <c>POST /requests/{id}/reject</c> (admin): declines and notifies the
    /// requester. With a <paramref name="reason"/> (server 0.28.0 and later)
    /// the requester sees why; without one no body is sent at all, which is
    /// what every server version accepts.
    /// </summary>
    public Task RejectAsync(Guid id, string? reason = null, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Post, $"/requests/{MarqueeApi.Segment(id)}/reject",
            body: reason == null ? null : new RejectRequest(reason),
            changes: ServerChange.Requests | ServerChange.Notifications, ct: ct);

    /// <summary>
    /// <c>POST /requests/approve-all</c> (admin): one at a time; failures
    /// stay pending. Throws the first failure when none could be approved.
    /// </summary>
    public Task<ApproveAllResult> ApproveAllAsync(CancellationToken ct = default) =>
        transport.MutateAsync<ApproveAllResult>(
            HttpMethod.Post, "/requests/approve-all",
            timeout: MarqueeApi.Timeouts.LongRunning,
            changes: ServerChange.Requests | ServerChange.Library | ServerChange.Notifications, ct: ct);
}
