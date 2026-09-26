using Marquee.Core.Models;

namespace Marquee.Core.Api;

// "Request from my Plex Watchlist" for your own account (Settings > Account,
// under Linked accounts). Turning it on is a plex.tv approval like linking
// Plex: StartAsync, open AuthUrl, then PollAsync until done.

public sealed partial class MarqueeApi
{
    public PlexWatchlistEndpoints PlexWatchlist => new(transport);
}

public sealed class PlexWatchlistEndpoints(MarqueeApi.Transport transport)
{
    private const string Path = "/me/plex-watchlist";

    /// <summary>
    /// <c>GET /me/plex-watchlist</c>. An older server without the feature
    /// answers 404: that's <see cref="Models.PlexWatchlist.Unavailable"/>,
    /// not an error.
    /// </summary>
    public async Task<PlexWatchlist> StatusAsync(CancellationToken ct = default)
    {
        try
        {
            return await transport.GetAsync<PlexWatchlist>(Path, ct: ct).ConfigureAwait(false);
        }
        catch (ApiException error) when (error.Kind == ApiErrorKind.NotFound)
        {
            return Models.PlexWatchlist.Unavailable;
        }
    }

    /// <summary>
    /// <c>POST /me/plex-watchlist/start</c>: open <c>AuthUrl</c>, then
    /// <see cref="PollAsync"/>. Conflict "Link your Plex account first.".
    /// </summary>
    public Task<PlexSignInStart> StartAsync(CancellationToken ct = default) =>
        transport.PostAsync<PlexSignInStart>(Path + "/start", timeout: MarqueeApi.Timeouts.Integrations, ct: ct);

    /// <summary>
    /// <c>POST /me/plex-watchlist/poll</c>: one poll. Null while pending
    /// (202), the new state once it's on (200; the first check then runs in
    /// the background). Throws Forbidden with the server's reason (403, a
    /// different Plex account), Expired (410) and Conflict (409, Plex isn't
    /// linked).
    /// </summary>
    public async Task<PlexWatchlist?> PollAsync(string handle, CancellationToken ct = default)
    {
        var raw = await transport.ExchangeAsync(
            HttpMethod.Post, Path + "/poll", new PlexWatchlistPollRequest(handle),
            PlexPoll.Answers, MarqueeApi.Timeouts.Integrations, ct).ConfigureAwait(false);
        return PlexPoll.Step(raw) is { } done ? ApiClient.Decode<PlexWatchlist>(done) : null;
    }

    /// <summary><c>PATCH /me/plex-watchlist</c>: which kinds are requested; a null one is left as it is.</summary>
    public Task<PlexWatchlist> SetTypesAsync(bool? movies, bool? tv, CancellationToken ct = default) =>
        transport.MutateAsync<PlexWatchlist>(HttpMethod.Patch, Path, body: new PlexWatchlistTypesRequest(movies, tv), ct: ct);

    /// <summary>
    /// <c>POST /me/plex-watchlist/sync</c>: "Check now", answering once the
    /// check is done. RateLimited "Checked a moment ago. Try again in a
    /// minute." after 5 in 5 minutes.
    /// </summary>
    public Task<PlexWatchlist> SyncAsync(CancellationToken ct = default) =>
        transport.MutateAsync<PlexWatchlist>(
            HttpMethod.Post, Path + "/sync",
            timeout: MarqueeApi.Timeouts.LongRunning, changes: ServerChange.Requests, ct: ct);

    /// <summary><c>DELETE /me/plex-watchlist</c>: turns it off and deletes the stored Plex sign-in.</summary>
    public Task<PlexWatchlist> DisableAsync(CancellationToken ct = default) =>
        transport.MutateAsync<PlexWatchlist>(HttpMethod.Delete, Path, ct: ct);
}
