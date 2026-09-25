using System.Globalization;
using Marquee.Core.Models;

namespace Marquee.Core.Api;

// Notifications (api-v1.md section 8): the bell. Tapping one opens
// /titles/{mediaType}/{tmdbId} and marks it read.

public sealed partial class MarqueeApi
{
    public NotificationsEndpoints Notifications => new(transport);
}

public sealed class NotificationsEndpoints(MarqueeApi.Transport transport)
{
    /// <summary>
    /// <c>GET /notifications</c>: newest first, with the unread count.
    /// </summary>
    /// <param name="limit">1 to 100; the server's default (null) is 20, the website's dropdown.</param>
    public Task<NotificationList> ListAsync(int? limit = null, CancellationToken ct = default) =>
        transport.GetAsync<NotificationList>(
            "/notifications",
            new Dictionary<string, string?> { ["limit"] = limit?.ToString(CultureInfo.InvariantCulture) },
            ct: ct);

    /// <summary><c>GET /notifications/unread-count</c> (<c>BadgesAsync</c> has it too).</summary>
    public async Task<int> UnreadCountAsync(CancellationToken ct = default)
    {
        var count = await transport.GetAsync<CountResponse>("/notifications/unread-count", ct: ct).ConfigureAwait(false);
        return count.Count;
    }

    /// <summary><c>POST /notifications/read-all</c>: "Mark all read".</summary>
    public Task MarkAllReadAsync(CancellationToken ct = default) =>
        transport.MutateAsync<OK>(HttpMethod.Post, "/notifications/read-all", changes: ServerChange.Notifications, ct: ct);

    /// <summary><c>POST /notifications/{id}/read</c>. NotFound for an unknown id or someone else's notification.</summary>
    public Task MarkReadAsync(Guid id, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Post, $"/notifications/{MarqueeApi.Segment(id)}/read",
            changes: ServerChange.Notifications, ct: ct);
}
