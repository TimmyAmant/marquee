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

    /// <summary><c>POST /auth/logout</c>: revokes this token only. Nothing on screen changes, so nothing is recorded.</summary>
    public Task LogoutAsync(CancellationToken ct = default) =>
        transport.MutateAsync<OK>(HttpMethod.Post, "/auth/logout", ct: ct);
}
