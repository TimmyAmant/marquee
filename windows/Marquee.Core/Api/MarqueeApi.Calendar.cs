using Marquee.Core.Models;

namespace Marquee.Core.Api;

// The calendar (api-v1.md section 9): upcoming Radarr releases and Sonarr
// air dates from the library owner's connections, one month at a time.

public sealed partial class MarqueeApi
{
    public CalendarEndpoints Calendar => new(transport);
}

public sealed class CalendarEndpoints(MarqueeApi.Transport transport)
{
    /// <summary>
    /// <c>GET /calendar?month=</c>: null is the server's current month. The
    /// server asks Sonarr and Radarr before answering, so it gets the
    /// integrations timeout like the Mac. Errors: Invalid for a malformed
    /// month (which <see cref="CalendarMonth"/> can't produce).
    /// </summary>
    public Task<CalendarMonthResponse> MonthAsync(CalendarMonth? month = null, CancellationToken ct = default) =>
        transport.GetAsync<CalendarMonthResponse>(
            "/calendar",
            new Dictionary<string, string?> { ["month"] = month?.ToString() },
            timeout: MarqueeApi.Timeouts.Integrations,
            ct: ct);
}
