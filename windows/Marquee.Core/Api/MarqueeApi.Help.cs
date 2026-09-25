using Marquee.Core.Models;

namespace Marquee.Core.Api;

// The Error reference (api-v1.md section 15).

public sealed partial class MarqueeApi
{
    public HelpEndpoints Help => new(transport);
}

public sealed class HelpEndpoints(MarqueeApi.Transport transport)
{
    /// <summary>
    /// <c>GET /help/errors</c>: the Error reference, grouped by area. Look an
    /// error the app just showed up with <c>ErrorReferenceExtensions.EntryFor</c>.
    /// </summary>
    public Task<IReadOnlyList<ErrorReferenceCategory>> ErrorsAsync(CancellationToken ct = default) =>
        transport.GetListAsync<ErrorReferenceCategory>("/help/errors", ct: ct);
}
