using Marquee.Core.Models;

namespace Marquee.Core.Api;

// Plex / Jellyfin accounts: linking your own (Settings > Account > Linked
// accounts), importing household members, and the admin's sign-up switch.
// Sign-in itself is AuthEndpoints.PlexStartAsync / PlexPollAsync / JellyfinAsync.

public sealed partial class MarqueeApi
{
    public LinksEndpoints Links => new(transport);
}

public sealed class LinksEndpoints(MarqueeApi.Transport transport)
{
    /// <summary><c>POST /me/links/plex/start</c>: open <c>AuthUrl</c>, then <see cref="PlexPollAsync"/>.</summary>
    public Task<PlexSignInStart> PlexStartAsync(CancellationToken ct = default) =>
        transport.PostAsync<PlexSignInStart>("/me/links/plex/start", timeout: MarqueeApi.Timeouts.Integrations, ct: ct);

    /// <summary>
    /// <c>POST /me/links/plex/poll</c>: one poll. False while pending (202),
    /// true once the Plex account is linked (200). Throws Forbidden with the
    /// server's reason (403) and Expired (410).
    /// </summary>
    public async Task<bool> PlexPollAsync(string handle, CancellationToken ct = default)
    {
        var raw = await transport.ExchangeAsync(
            HttpMethod.Post, "/me/links/plex/poll", new PlexLinkPollRequest(handle),
            PlexPoll.Answers, MarqueeApi.Timeouts.Integrations, ct).ConfigureAwait(false);
        if (PlexPoll.Step(raw) == null)
        {
            return false;
        }
        transport.Record(ServerChange.Users);
        return true;
    }

    /// <summary>
    /// <c>POST /me/links/jellyfin</c>: links the Jellyfin account these
    /// credentials sign in to. Errors: InvalidCredentials, Conflict (linked
    /// to someone else), Forbidden with the server's reason (403).
    /// </summary>
    public async Task JellyfinAsync(string username, string password, CancellationToken ct = default)
    {
        var raw = await transport.ExchangeAsync(
            HttpMethod.Post, "/me/links/jellyfin", new JellyfinLinkRequest(username, password),
            [403], MarqueeApi.Timeouts.Integrations, ct).ConfigureAwait(false);
        if (raw.StatusCode == 403)
        {
            throw ApiException.RefusedFromResponse(raw.StatusCode, raw.BodyText, raw.HasApiHeader);
        }
        transport.Record(ServerChange.Users);
    }

    /// <summary>
    /// <c>DELETE /me/links/{plex|jellyfin}</c>. Refused (Invalid/Conflict)
    /// when it would leave the account with no way to sign in.
    /// </summary>
    public Task UnlinkAsync(MediaServerKind server, CancellationToken ct = default) =>
        transport.MutateAsync<EmptyResponse>(
            HttpMethod.Delete, $"/me/links/{MarqueeApi.Segment(server.WireValue())}",
            changes: ServerChange.Users, ct: ct);
}
