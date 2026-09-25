using Marquee.Core.Models;

namespace Marquee.Core.Api;

// Settings > Activity (api-v1.md section 10): the admin's log of who
// requested, approved or declined what.

public sealed partial class MarqueeApi
{
    public ActivityEndpoints Activity => new(transport);
}

public sealed class ActivityEndpoints(MarqueeApi.Transport transport)
{
    /// <summary><c>GET /settings/activity</c> (admin): the 50 most recent request events. Empty: "Nothing yet."</summary>
    public Task<IReadOnlyList<ActivityItem>> RecentAsync(CancellationToken ct = default) =>
        transport.GetListAsync<ActivityItem>("/settings/activity", ct: ct);
}
