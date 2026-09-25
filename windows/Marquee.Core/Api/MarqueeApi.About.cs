using Marquee.Core.Models;

namespace Marquee.Core.Api;

// Settings, About and the Releases page (api-v1.md section 14). Both are
// open to every signed-in user.

public sealed partial class MarqueeApi
{
    public AboutEndpoints About => new(transport);
}

public sealed class AboutEndpoints(MarqueeApi.Transport transport)
{
    /// <summary><c>GET /settings/about</c>: version, library counts, time zone, support links.</summary>
    public Task<AboutInfo> InfoAsync(CancellationToken ct = default) =>
        transport.GetAsync<AboutInfo>("/settings/about", ct: ct);

    /// <summary><c>GET /changelog</c>: the Releases page, newest first.</summary>
    public Task<IReadOnlyList<ChangelogEntry>> ChangelogAsync(CancellationToken ct = default) =>
        transport.GetListAsync<ChangelogEntry>("/changelog", ct: ct);
}
