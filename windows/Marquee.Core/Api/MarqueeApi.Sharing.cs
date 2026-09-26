using Marquee.Core.Models;

namespace Marquee.Core.Api;

// "Share" on a title (api-v1.md "Share a title", 0.45+). Sending lives here
// though its path is the title's, like reporting a problem. A share only
// notifies the people it goes to, so nothing on this account changes and
// nothing is recorded.

public sealed partial class MarqueeApi
{
    public SharingEndpoints Sharing => new(transport);
}

public sealed class SharingEndpoints(MarqueeApi.Transport transport)
{
    /// <summary>
    /// <c>GET /users/shareable</c>: everyone in the household but you, by
    /// name, with Marquee's public address for the Marquee link. Any member
    /// may call it. An older server answers 404.
    /// </summary>
    public Task<ShareableUsersResponse> ListShareableUsersAsync(CancellationToken ct = default) =>
        transport.GetAsync<ShareableUsersResponse>("/users/shareable", ct: ct);

    /// <summary>
    /// <c>POST /titles/{type}/{tmdbId}/share</c>: "Send". Each recipient gets
    /// a <c>title_shared</c> notification. Invalid ("Pick who to share it
    /// with.", "Keep the note under 280 characters.", …), NotFound ("Someone
    /// you picked isn't in this household any more."), RateLimited (30 an
    /// hour, counting each recipient), Upstream (TMDb); show the server's
    /// message. Returns how many people it went to.
    /// </summary>
    public async Task<int> ShareTitleAsync(MediaType type, int tmdbId, ShareTitleBody body, CancellationToken ct = default)
    {
        var result = await transport.MutateAsync<ShareTitleResponse>(HttpMethod.Post, $"{TitlesEndpoints.Path(type, tmdbId)}/share",
            body: body, timeout: MarqueeApi.Timeouts.Tmdb, ct: ct)
            .ConfigureAwait(false);
        return result.SharedWith;
    }
}
