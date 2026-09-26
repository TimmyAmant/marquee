using Marquee.Core.Models;

namespace Marquee.Core.Api;

// Discovery and auth, /me and /badges (api-v1.md section 1).

public sealed partial class MarqueeApi
{
    /// <summary><c>GET /me</c>: the account plus its own settings.</summary>
    public Task<Me> MeAsync(CancellationToken ct = default) =>
        transport.GetAsync<Me>("/me", ct: ct);

    /// <summary><c>GET /badges</c>: unread notifications and (admin) pending requests in one cheap call.</summary>
    public Task<Badges> BadgesAsync(CancellationToken ct = default) =>
        transport.GetAsync<Badges>("/badges", ct: ct);

    public AuthEndpoints Auth => new(transport);
}

/// <summary>
/// Sign-in plumbing. The app signs in through <c>ServerSession.LoginAsync</c>
/// and <c>SetupAsync</c>, which also store the token; these return the raw
/// response.
/// </summary>
public sealed class AuthEndpoints(MarqueeApi.Transport transport)
{
    /// <summary><c>GET /server-info</c> (public).</summary>
    public Task<ServerInfo> ServerInfoAsync(CancellationToken ct = default) =>
        transport.GetAsync<ServerInfo>("/server-info", ct: ct);

    /// <summary><c>POST /auth/login</c> (public). Errors: Invalid, InvalidCredentials, RateLimited.</summary>
    public Task<AuthResponse> LoginAsync(string username, string password, string deviceName, CancellationToken ct = default) =>
        transport.PostAsync<AuthResponse>("/auth/login", new LoginRequest(username, password, deviceName), ct: ct);

    /// <summary>
    /// <c>POST /auth/setup</c> (public): the first account, as admin. Errors:
    /// SetupComplete, RateLimited, Invalid.
    /// </summary>
    public Task<AuthResponse> SetupAsync(string username, string password, string displayName, string deviceName, CancellationToken ct = default) =>
        transport.PostAsync<AuthResponse>("/auth/setup", new SetupRequest(username, password, displayName, deviceName), ct: ct);

    /// <summary>
    /// <c>POST /auth/plex/start</c> (public, rate-limited): open
    /// <c>AuthUrl</c> in the browser, then <see cref="PlexPollAsync"/> with
    /// the handle. Offered only when <c>server-info.signIn.plex</c>.
    /// </summary>
    public Task<PlexSignInStart> PlexStartAsync(CancellationToken ct = default) =>
        transport.PostAsync<PlexSignInStart>("/auth/plex/start", timeout: MarqueeApi.Timeouts.Integrations, ct: ct);

    /// <summary>
    /// <c>POST /auth/plex/poll</c>: one poll. Null while Plex hasn't said yes
    /// yet (202), the login response once it has (200). Throws Forbidden
    /// with the server's reason (403) and Expired (410).
    /// </summary>
    public async Task<AuthResponse?> PlexPollAsync(string handle, string deviceName, CancellationToken ct = default)
    {
        var raw = await transport.ExchangeAsync(
            HttpMethod.Post, "/auth/plex/poll", new PlexPollRequest(handle, deviceName),
            PlexPoll.Answers, MarqueeApi.Timeouts.Integrations, ct).ConfigureAwait(false);
        return PlexPoll.Step(raw) is { } done ? ApiClient.Decode<AuthResponse>(done) : null;
    }

    /// <summary>
    /// <c>POST /auth/jellyfin</c> (public, rate-limited): a Jellyfin username
    /// and password, checked by the server against its Jellyfin. Errors:
    /// InvalidCredentials, RateLimited, Forbidden with the server's reason (403).
    /// </summary>
    public async Task<AuthResponse> JellyfinAsync(string username, string password, string deviceName, CancellationToken ct = default)
    {
        var raw = await transport.ExchangeAsync(
            HttpMethod.Post, "/auth/jellyfin", new JellyfinLoginRequest(username, password, deviceName),
            [403], MarqueeApi.Timeouts.Integrations, ct).ConfigureAwait(false);
        if (raw.StatusCode == 403)
        {
            throw ApiException.RefusedFromResponse(raw.StatusCode, raw.BodyText, raw.HasApiHeader);
        }
        return ApiClient.Decode<AuthResponse>(raw);
    }

    /// <summary>
    /// <c>POST /auth/jellyfin/quick-connect/start</c> (public, 0.44+): show
    /// <c>Code</c>, then <see cref="QuickConnectPollAsync"/> with the handle.
    /// Offered only when <c>server-info.signIn.quickConnect</c>. Conflict
    /// when Quick Connect is off on the Jellyfin server (or it's Emby).
    /// </summary>
    public Task<QuickConnectStart> QuickConnectStartAsync(CancellationToken ct = default) =>
        transport.PostAsync<QuickConnectStart>("/auth/jellyfin/quick-connect/start", timeout: MarqueeApi.Timeouts.Integrations, ct: ct);

    /// <summary>
    /// <c>POST /auth/jellyfin/quick-connect/poll</c>: one poll, like
    /// <see cref="PlexPollAsync"/>. Null while the code isn't approved yet
    /// (202), the login response once it is (200). Throws Forbidden with the
    /// server's reason (403) and Expired (410).
    /// </summary>
    public async Task<AuthResponse?> QuickConnectPollAsync(string handle, string deviceName, CancellationToken ct = default)
    {
        var raw = await transport.ExchangeAsync(
            HttpMethod.Post, "/auth/jellyfin/quick-connect/poll", new HandlePollRequest(handle, deviceName),
            PlexPoll.Answers, MarqueeApi.Timeouts.Integrations, ct).ConfigureAwait(false);
        return PlexPoll.Step(raw, ApiException.QuickConnectExpiredMessage) is { } done ? ApiClient.Decode<AuthResponse>(done) : null;
    }

    /// <summary>
    /// <c>POST /auth/sso/start</c> (public, rate-limited, 0.44+): open
    /// <c>AuthUrl</c> in the browser (only if <see cref="SsoSignInStart.UrlOn"/>
    /// allows it), then <see cref="SsoPollAsync"/> with the handle. Offered
    /// only when <c>server-info.signIn.sso</c>; <paramref name="deviceName"/>
    /// shows on the page the browser opens.
    /// </summary>
    public Task<SsoSignInStart> SsoStartAsync(string deviceName, CancellationToken ct = default) =>
        transport.PostAsync<SsoSignInStart>("/auth/sso/start", new SsoStartRequest(deviceName), MarqueeApi.Timeouts.Integrations, ct);

    /// <summary>
    /// <c>POST /auth/sso/poll</c>: one poll, like <see cref="PlexPollAsync"/>.
    /// Null until the sign-in is finished in the browser (202), the login
    /// response once it is (200). Throws Forbidden with the server's reason
    /// (403: not in the required group, no account, cancelled) and Expired (410).
    /// </summary>
    public async Task<AuthResponse?> SsoPollAsync(string handle, string deviceName, CancellationToken ct = default)
    {
        var raw = await transport.ExchangeAsync(
            HttpMethod.Post, "/auth/sso/poll", new HandlePollRequest(handle, deviceName),
            PlexPoll.Answers, MarqueeApi.Timeouts.Integrations, ct).ConfigureAwait(false);
        return PlexPoll.Step(raw, ApiException.SsoSignInExpiredMessage) is { } done ? ApiClient.Decode<AuthResponse>(done) : null;
    }

    /// <summary><c>POST /auth/logout</c>: revokes this token only. Nothing on screen changes, so nothing is recorded.</summary>
    public Task LogoutAsync(CancellationToken ct = default) =>
        transport.MutateAsync<OK>(HttpMethod.Post, "/auth/logout", ct: ct);
}
