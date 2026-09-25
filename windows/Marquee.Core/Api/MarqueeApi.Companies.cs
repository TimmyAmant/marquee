using Marquee.Core.Models;

namespace Marquee.Core.Api;

// The studio page (api-v1.md section 5).

public sealed partial class MarqueeApi
{
    public CompaniesEndpoints Companies => new(transport);
}

public sealed class CompaniesEndpoints(MarqueeApi.Transport transport)
{
    /// <summary>
    /// <c>GET /companies/{tmdbId}</c>: a studio and its catalog. Errors:
    /// NotFound, Upstream. TMDb-backed, so it gets the longer timeout.
    /// </summary>
    public Task<CompanyDetail> DetailAsync(int tmdbId, CancellationToken ct = default) =>
        transport.GetAsync<CompanyDetail>($"/companies/{tmdbId}", timeout: MarqueeApi.Timeouts.Tmdb, ct: ct);
}
