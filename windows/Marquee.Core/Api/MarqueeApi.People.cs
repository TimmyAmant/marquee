using Marquee.Core.Models;

namespace Marquee.Core.Api;

// The person page (api-v1.md section 5).

public sealed partial class MarqueeApi
{
    public PeopleEndpoints People => new(transport);
}

public sealed class PeopleEndpoints(MarqueeApi.Transport transport)
{
    /// <summary>
    /// <c>GET /people/{tmdbId}</c>: bio and acting filmography. Errors:
    /// NotFound (unknown person), Upstream. TMDb-backed, so it gets the
    /// longer timeout.
    /// </summary>
    public Task<PersonDetail> DetailAsync(int tmdbId, CancellationToken ct = default) =>
        transport.GetAsync<PersonDetail>($"/people/{tmdbId}", timeout: MarqueeApi.Timeouts.Tmdb, ct: ct);
}
