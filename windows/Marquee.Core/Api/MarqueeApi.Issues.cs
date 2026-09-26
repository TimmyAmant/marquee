using Marquee.Core.Models;

namespace Marquee.Core.Api;

// Problem reports (api-v1.md section 7, 0.38+). Reporting lives here too,
// though its path is the title's: it is the one way in to this area. They
// show on the Requests page and count toward its badge, so every change is
// recorded as a Requests change.

public sealed partial class MarqueeApi
{
    public IssuesEndpoints Issues => new(transport);
}

public sealed class IssuesEndpoints(MarqueeApi.Transport transport)
{
    /// <summary>
    /// <c>GET /issues</c>: the admin's open reports then the latest fixed
    /// ones; a member's own. An older server answers 404.
    /// </summary>
    public Task<IssuesResponse> ListAsync(CancellationToken ct = default) =>
        transport.GetAsync<IssuesResponse>("/issues", ct: ct);

    /// <summary>
    /// <c>POST /titles/{type}/{tmdbId}/issues</c>: "Send report". Invalid
    /// ("Pick what's wrong.", "Say what's wrong.", …), RateLimited (20 open
    /// per person, or 10 an hour; show the server's message), Upstream
    /// (TMDb). Returns the new report's id.
    /// </summary>
    public async Task<Guid> ReportAsync(MediaType type, int tmdbId, ReportIssueBody body, CancellationToken ct = default)
    {
        var result = await transport.MutateAsync<ReportIssueResult>(HttpMethod.Post, $"{TitlesEndpoints.Path(type, tmdbId)}/issues",
            body: body, timeout: MarqueeApi.Timeouts.Tmdb, changes: ServerChange.Requests, ct: ct)
            .ConfigureAwait(false);
        return result.IssueId;
    }

    /// <summary>
    /// <c>POST /issues/{id}/resolve</c> (admin): "Mark fixed", notifying the
    /// reporter. A <paramref name="note"/> (up to 500 characters) is sent as
    /// <c>{"note": …}</c>; without one no body is sent. NotFound "That report
    /// isn't open any more."
    /// </summary>
    public Task ResolveAsync(Guid id, string? note = null, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Post, $"/issues/{MarqueeApi.Segment(id)}/resolve",
            body: note.NonBlank() is { } text ? new ResolveIssueBody(text) : null,
            changes: ServerChange.Requests | ServerChange.Notifications, ct: ct);

    /// <summary><c>POST /issues/{id}/search</c> (admin): "Search again". Conflict "Not tracked in Radarr/Sonarr."</summary>
    public Task SearchAgainAsync(Guid id, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Post, $"/issues/{MarqueeApi.Segment(id)}/search",
            timeout: MarqueeApi.Timeouts.Integrations, changes: ServerChange.Library, ct: ct);

    /// <summary><c>DELETE /issues/{id}</c>: "Withdraw" your own open report, or (admin) "Remove" any.</summary>
    public Task DeleteAsync(Guid id, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Delete, $"/issues/{MarqueeApi.Segment(id)}",
            changes: ServerChange.Requests, ct: ct);
}
