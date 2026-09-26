using Marquee.Core.Models;

namespace Marquee.Core.Api;

// The title page and its Sonarr/Radarr actions (api-v1.md sections 3 and 4),
// plus requesting a title (section 7), which lives here rather than with the
// requests area because its path is the title's.

public sealed partial class MarqueeApi
{
    public TitlesEndpoints Titles => new(transport);
}

public sealed class TitlesEndpoints(MarqueeApi.Transport transport)
{
    /// <summary><c>GET /titles/{type}/{tmdbId}</c>: everything the title page renders.</summary>
    public Task<TitleDetail> DetailAsync(MediaType type, int tmdbId, CancellationToken ct = default) =>
        transport.GetAsync<TitleDetail>(Path(type, tmdbId), timeout: MarqueeApi.Timeouts.Tmdb, ct: ct);

    /// <summary><c>GET /titles/tv/{tmdbId}/seasons/{seasonNumber}</c>: one season's episodes.</summary>
    public Task<SeasonEpisodes> SeasonAsync(int seasonNumber, int showTmdbId, CancellationToken ct = default) =>
        transport.GetAsync<SeasonEpisodes>($"{Path(MediaType.Tv, showTmdbId)}/seasons/{seasonNumber}", timeout: MarqueeApi.Timeouts.Tmdb, ct: ct);

    /// <summary>
    /// <c>GET /titles/{type}/{tmdbId}/status</c>: just <c>library</c> +
    /// <c>viewer</c>, the cheap refresh after an action (see
    /// <see cref="TitleDetail.Updating"/>).
    /// </summary>
    public Task<TitleStatus> StatusAsync(MediaType type, int tmdbId, CancellationToken ct = default) =>
        transport.GetAsync<TitleStatus>($"{Path(type, tmdbId)}/status", timeout: MarqueeApi.Timeouts.Tmdb, ct: ct);

    /// <summary>
    /// <c>POST /titles/{type}/{tmdbId}/add</c>: "Add to Radarr/Sonarr" and
    /// poster quick-add (admin). Conflict("Connect Radarr in Settings first.")
    /// and the like; <see cref="ApiException.IsSonarrUnresolvable"/> for a
    /// show without a TVDB id.
    /// </summary>
    public Task AddAsync(MediaType type, int tmdbId, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(HttpMethod.Post, $"{Path(type, tmdbId)}/add",
            timeout: MarqueeApi.Timeouts.Integrations, changes: ServerChange.Library | ServerChange.Requests, ct: ct);

    /// <summary>
    /// <c>POST /titles/{type}/{tmdbId}/add</c> with <c>{"is4k": true}</c>
    /// (0.37+): "Add to 4K Radarr/Sonarr" (admin, <see cref="FourKViewerState.CanAdd"/>).
    /// Errors name "the 4K Radarr" / "the 4K Sonarr".
    /// </summary>
    public Task AddFourKAsync(MediaType type, int tmdbId, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(HttpMethod.Post, $"{Path(type, tmdbId)}/add", body: new FourKBody(true),
            timeout: MarqueeApi.Timeouts.Integrations, changes: ServerChange.Library | ServerChange.Requests, ct: ct);

    /// <summary>
    /// <c>POST /titles/{type}/{tmdbId}/add</c> with the "Advanced" picks
    /// (0.43+): a server, quality profile, root folder, tags and (TV) series
    /// type; <paramref name="is4k"/> for "Add to 4K …". Errors name the
    /// server ("Couldn't add this movie to Radarr 2.").
    /// </summary>
    public Task AddAsync(MediaType type, int tmdbId, AddOverrides overrides, bool is4k = false, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(HttpMethod.Post, $"{Path(type, tmdbId)}/add", body: TitleAddRequest.From(overrides, is4k),
            timeout: MarqueeApi.Timeouts.Integrations, changes: ServerChange.Library | ServerChange.Requests, ct: ct);

    /// <summary>
    /// <c>GET /titles/{type}/{tmdbId}/add-options</c> (0.43+, admin or
    /// trusted): the servers "Advanced" offers, with their pickers and
    /// defaults; <paramref name="is4k"/> lists the 4K ones. NotFound from an
    /// older server: hide Advanced.
    /// </summary>
    public Task<AddOptions> AddOptionsAsync(MediaType type, int tmdbId, bool is4k = false, CancellationToken ct = default) =>
        transport.GetAsync<AddOptions>(
            $"{Path(type, tmdbId)}/add-options",
            query: is4k ? new Dictionary<string, string?> { ["is4k"] = "true" } : null,
            timeout: MarqueeApi.Timeouts.Integrations, ct: ct);

    /// <summary><c>POST /titles/{type}/{tmdbId}/search</c>: "Search now" (admin). Website text: "Search queued."</summary>
    public Task SearchNowAsync(MediaType type, int tmdbId, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(HttpMethod.Post, $"{Path(type, tmdbId)}/search",
            timeout: MarqueeApi.Timeouts.Integrations, changes: ServerChange.Library, ct: ct);

    /// <summary><c>PUT /titles/{type}/{tmdbId}/monitored</c>: "Stop/Start monitoring" (admin). Returns the new state.</summary>
    public async Task<bool> SetMonitoredAsync(bool monitored, MediaType type, int tmdbId, CancellationToken ct = default)
    {
        var result = await transport.MutateAsync<MonitoredResult>(HttpMethod.Put, $"{Path(type, tmdbId)}/monitored",
            body: new SetMonitoredRequest(monitored), timeout: MarqueeApi.Timeouts.Integrations, changes: ServerChange.Library, ct: ct)
            .ConfigureAwait(false);
        return result.Monitored;
    }

    /// <summary>
    /// <c>POST /titles/{type}/{tmdbId}/relink</c>: "Wrong match? Fix ID"
    /// (admin). Returns the new TMDb id; navigate there.
    /// </summary>
    public async Task<int> RelinkAsync(MediaType type, int tmdbId, RelinkTarget target, CancellationToken ct = default)
    {
        var result = await transport.MutateAsync<RelinkResult>(HttpMethod.Post, $"{Path(type, tmdbId)}/relink",
            body: target, timeout: MarqueeApi.Timeouts.Tmdb, changes: ServerChange.Library | ServerChange.Requests, ct: ct)
            .ConfigureAwait(false);
        return result.NewTmdbId;
    }

    /// <summary>
    /// <c>POST /titles/{type}/{tmdbId}/request</c>: "Request". Auto-approved
    /// when the admin enabled that for you (the Mac's <c>requests.create</c>).
    /// Conflict("You've already requested this.") / ("You already have this
    /// in your library."). Returns the new request's id.
    /// </summary>
    public async Task<Guid> RequestAsync(MediaType type, int tmdbId, CancellationToken ct = default)
    {
        var result = await transport.MutateAsync<TitleRequestCreated>(HttpMethod.Post, $"{Path(type, tmdbId)}/request",
            timeout: MarqueeApi.Timeouts.Integrations, changes: ServerChange.Requests | ServerChange.Library, ct: ct)
            .ConfigureAwait(false);
        return result.RequestId;
    }

    /// <summary>
    /// <c>POST /titles/tv/{tmdbId}/request</c> with <c>{"seasons": [...]}</c>:
    /// just those seasons (sorted, de-duplicated). The server drops the ones
    /// already monitored or complete; Conflict("Those seasons are already in
    /// your library or on their way.") when nothing is left, Invalid for a
    /// season TMDb doesn't list. Returns the new request's id.
    /// </summary>
    public async Task<Guid> RequestAsync(MediaType type, int tmdbId, IReadOnlyList<int> seasons, CancellationToken ct = default)
    {
        var body = new SeasonRequestBody(seasons.Distinct().Order().ToList());
        var result = await transport.MutateAsync<TitleRequestCreated>(HttpMethod.Post, $"{Path(type, tmdbId)}/request",
            body: body, timeout: MarqueeApi.Timeouts.Integrations, changes: ServerChange.Requests | ServerChange.Library, ct: ct)
            .ConfigureAwait(false);
        return result.RequestId;
    }

    /// <summary>
    /// <c>POST /titles/{type}/{tmdbId}/request</c> with <c>{"is4k": true}</c>
    /// (0.37+): "Request in 4K" (<see cref="FourKViewerState.CanRequest"/>).
    /// Always the whole title, separate from a regular request.
    /// Conflict("4K requests aren't set up on this server.") / ("You've
    /// already requested this in 4K.") / ("It's already in the 4K library or
    /// on its way."). Returns the new request's id.
    /// </summary>
    public async Task<Guid> RequestFourKAsync(MediaType type, int tmdbId, CancellationToken ct = default)
    {
        var result = await transport.MutateAsync<TitleRequestCreated>(HttpMethod.Post, $"{Path(type, tmdbId)}/request",
            body: new FourKBody(true), timeout: MarqueeApi.Timeouts.Integrations, changes: ServerChange.Requests | ServerChange.Library, ct: ct)
            .ConfigureAwait(false);
        return result.RequestId;
    }

    /// <summary><c>/titles/{type}/{tmdbId}</c>, the prefix every title route shares.</summary>
    public static string Path(MediaType type, int tmdbId) => $"/titles/{MarqueeApi.Segment(type)}/{tmdbId}";
}
