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

    /// <summary>
    /// <c>GET /requests/not-found</c> (0.46+, admin or trusted): "Can't
    /// find", approved requests Sonarr/Radarr has found nothing for,
    /// longest-missing first. An older server answers 404: hide the section.
    /// </summary>
    public Task<NotFoundRequests> NotFoundAsync(CancellationToken ct = default) =>
        transport.GetAsync<NotFoundRequests>("/requests/not-found", ct: ct);

    /// <summary>
    /// <c>POST /requests/{id}/not-found/search</c> (0.46+): "Search again",
    /// the request's Sonarr/Radarr searches for it now; it stays listed until
    /// something is grabbed. NotFound "That request isn't in Can't find any
    /// more.", Conflict when the server is gone or no longer has the title,
    /// Upstream when it can't be reached.
    /// </summary>
    public Task SearchNotFoundAsync(Guid id, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Post, $"/requests/{MarqueeApi.Segment(id)}/not-found/search",
            timeout: MarqueeApi.Timeouts.Integrations, changes: ServerChange.Library, ct: ct);

    /// <summary>
    /// <c>POST /requests/{id}/not-found/dismiss</c> (0.46+): "Mark as
    /// found", off the list for good, and its alerts marked read for
    /// everyone. The request stays approved. NotFound "That request isn't in
    /// Can't find any more."
    /// </summary>
    public Task DismissNotFoundAsync(Guid id, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Post, $"/requests/{MarqueeApi.Segment(id)}/not-found/dismiss",
            changes: ServerChange.Requests | ServerChange.Notifications, ct: ct);

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

    // MARK: Lifecycle (0.46+)

    /// <summary>
    /// <c>PATCH /requests/{id}</c> (0.46+): changes a pending request — your
    /// own, or (a reviewer) anyone's — before it's approved. See
    /// <see cref="RequestEdit"/> for absent vs null <c>seasons</c>. Conflict
    /// "It's already been reviewed, so it can't be changed. Ask in its
    /// comments instead." and the rules of asking afresh; Invalid for a movie
    /// with seasons or a 4K request with some. An older server answers 404.
    /// </summary>
    public Task EditAsync(Guid id, RequestEdit edit, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Patch, $"/requests/{MarqueeApi.Segment(id)}",
            body: edit.ToJson(),
            timeout: MarqueeApi.Timeouts.Integrations,
            changes: ServerChange.Requests | ServerChange.Notifications, ct: ct);

    /// <summary>
    /// <c>PATCH /requests/{id}</c> (0.46+) with <paramref name="seasons"/>
    /// (null for the whole series) and, when given, <paramref name="is4k"/>.
    /// Use <see cref="EditAsync(Guid, RequestEdit, CancellationToken)"/> to
    /// leave the seasons out altogether.
    /// </summary>
    public Task EditAsync(Guid id, IReadOnlyList<int>? seasons, bool? is4k, CancellationToken ct = default) =>
        EditAsync(id, seasons == null ? RequestEdit.WholeSeries(is4k) : RequestEdit.JustSeasons(seasons, is4k), ct);

    /// <summary>
    /// <c>GET /requests/{id}/edit-options</c> (0.46+): what "Edit" can offer.
    /// NotFound for someone who may not edit it (and on an older server),
    /// Conflict once it's reviewed. Sonarr is asked about the seasons, so it
    /// gets the integrations timeout.
    /// </summary>
    public Task<RequestEditOptions> EditOptionsAsync(Guid id, CancellationToken ct = default) =>
        transport.GetAsync<RequestEditOptions>($"/requests/{MarqueeApi.Segment(id)}/edit-options",
            timeout: MarqueeApi.Timeouts.Integrations, ct: ct);

    /// <summary>
    /// <c>DELETE /requests/{id}</c> (0.46+): "Cancel request" on your own
    /// pending request; it's gone, with its conversation. NotFound "Request
    /// not found.", Forbidden "Only whoever asked can cancel it — decline it
    /// instead.", Conflict once reviewed, RateLimited past 30 an hour.
    /// </summary>
    public Task CancelAsync(Guid id, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Delete, $"/requests/{MarqueeApi.Segment(id)}",
            changes: ServerChange.Requests | ServerChange.Notifications, ct: ct);

    /// <summary>
    /// <c>POST /requests/{id}/retry</c> (0.46+, admin or trusted): "Retry" a
    /// request under "Couldn't add", with the Advanced picks it was approved
    /// with or (a non-null <paramref name="overrides"/>) the ones given.
    /// NotFound "That request isn't waiting to be added any more.", Conflict
    /// "Someone's already retrying it.", Upstream when still unreachable.
    /// </summary>
    public Task RetryAsync(Guid id, AddOverrides? overrides = null, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Post, $"/requests/{MarqueeApi.Segment(id)}/retry",
            body: overrides,
            timeout: MarqueeApi.Timeouts.Integrations,
            changes: ServerChange.Requests | ServerChange.Library | ServerChange.Notifications, ct: ct);

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
