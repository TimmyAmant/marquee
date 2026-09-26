namespace Marquee.Core.Models;

// Single sign-on (the admin's own OpenID Connect provider) and Jellyfin's
// Quick Connect (0.44+). Like Plex sign-in, both are a start call and a
// polled handle; a server older than 0.44 sends neither `signIn.sso` nor
// `signIn.quickConnect`, so no button shows.

/// <summary>Sign-in pages from the server the app is willing to open in the browser.</summary>
public static class SignInWeb
{
    /// <summary>
    /// The URL when it's an https page, or a page on the Marquee server's
    /// own origin (<paramref name="server"/>: scheme, host and port), else
    /// null. The single sign-on page is always Marquee's own "Continue with
    /// …?" page at the address the admin set; the check keeps a server (or
    /// something pretending to be one) from opening a file, another app's
    /// URL scheme, or a plain-http page somewhere else.
    /// </summary>
    public static Uri? Url(string? value, Uri? server) =>
        Uri.TryCreate(value, UriKind.Absolute, out var url) && Allows(url, server) ? url : null;

    /// <inheritdoc cref="Url"/>
    public static bool Allows(Uri? url, Uri? server)
    {
        if (url is not { IsAbsoluteUri: true })
            return false;
        if (string.Equals(url.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            return true;
        return IsOnServer(url, server);
    }

    /// <summary>An http(s) URL with the same scheme, host and port as <paramref name="server"/>, and no user name in it.</summary>
    private static bool IsOnServer(Uri url, Uri? server)
    {
        if (server is not { IsAbsoluteUri: true } || url.UserInfo.Length > 0)
            return false;
        if (!string.Equals(url.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(url.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            return false;
        return string.Equals(url.Scheme, server.Scheme, StringComparison.OrdinalIgnoreCase)
            && string.Equals(url.IdnHost, server.IdnHost, StringComparison.OrdinalIgnoreCase)
            && url.Port == server.Port;
    }
}

/// <summary>
/// <c>server-info.signIn.sso</c> (0.44+): single sign-on is set up. Offer
/// "Sign in with {Name}".
/// </summary>
public sealed record SsoSignIn
{
    /// <summary>The button's name: "Authentik", "Pocket ID", "Google".</summary>
    public required string Name { get; init; }

    /// <summary>New accounts from single sign-on are on: mention it in the newcomer line.</summary>
    public bool Signup { get; init; }
}

/// <summary>
/// <c>POST /auth/sso/start</c> and <c>/me/links/sso/start</c>: open
/// <see cref="AuthUrl"/> in the browser (only when <see cref="UrlOn"/>
/// allows it), then poll with <see cref="Handle"/> until <see cref="ExpiresAt"/>.
/// </summary>
public sealed record SsoSignInStart
{
    public required string Handle { get; init; }
    public required string AuthUrl { get; init; }
    public required DateTimeOffset ExpiresAt { get; init; }

    /// <summary><see cref="AuthUrl"/> if it's https or on <paramref name="server"/>'s origin (see <see cref="SignInWeb.Url"/>).</summary>
    public Uri? UrlOn(Uri? server) => SignInWeb.Url(AuthUrl, server);
}

/// <summary><c>POST /auth/sso/start</c> body.</summary>
public sealed record SsoStartRequest(string DeviceName);

/// <summary><c>POST /auth/sso/poll</c> and <c>/auth/jellyfin/quick-connect/poll</c> body.</summary>
public sealed record HandlePollRequest(string Handle, string DeviceName);

/// <summary><c>POST /me/links/sso/poll</c> body.</summary>
public sealed record SsoLinkPollRequest(string Handle);

/// <summary>
/// <c>POST /auth/jellyfin/quick-connect/start</c>: show <see cref="Code"/>
/// large, then poll with <see cref="Handle"/> until <see cref="ExpiresAt"/>.
/// </summary>
public sealed record QuickConnectStart
{
    public required string Handle { get; init; }

    /// <summary>What to enter in a signed-in Jellyfin app's Quick Connect, e.g. "482915".</summary>
    public required string Code { get; init; }

    public required DateTimeOffset ExpiresAt { get; init; }
}

/// <summary><c>GET</c>/<c>PUT</c>/<c>DELETE /settings/sso</c> (admin). The client secret is never returned.</summary>
public sealed record SsoSettings
{
    public const string DefaultScopes = "openid profile email";
    public const string DefaultGroupsClaim = "groups";

    /// <summary>The path under Marquee's address the provider sends people back to.</summary>
    public const string CallbackPath = "/api/auth/sso/callback";

    /// <summary>False: not set up; the other fields are the defaults.</summary>
    public required bool Configured { get; init; }

    public required string Name { get; init; }
    public required string Issuer { get; init; }
    public required string ClientId { get; init; }

    /// <summary>A client secret is saved (none: a public client, PKCE only).</summary>
    public required bool HasClientSecret { get; init; }

    public required string Scopes { get; init; }

    /// <summary>Marquee's address as people reach it.</summary>
    public required string PublicUrl { get; init; }

    /// <summary>The redirect URI to register with the provider, exactly.</summary>
    public required string CallbackUrl { get; init; }

    /// <summary>"New accounts from single sign-on".</summary>
    public required bool AllowSignup { get; init; }

    /// <summary>"Match existing accounts by verified email".</summary>
    public required bool MatchEmail { get; init; }

    public string? RequiredGroup { get; init; }
    public string? TrustedGroup { get; init; }
    public required string GroupsClaim { get; init; }

    /// <summary>
    /// The redirect URI for a typed <paramref name="publicUrl"/>: its origin
    /// plus <see cref="CallbackPath"/>, as the website computes it while the
    /// admin types; null when it isn't an http(s) address yet.
    /// </summary>
    public static string? CallbackUrlFor(string? publicUrl)
    {
        if (!Uri.TryCreate(publicUrl?.Trim(), UriKind.Absolute, out var url)
            || (url.Scheme != Uri.UriSchemeHttp && url.Scheme != Uri.UriSchemeHttps)
            || url.Host.Length == 0)
            return null;
        return url.GetLeftPart(UriPartial.Authority) + CallbackPath;
    }
}

/// <summary>
/// <c>PUT /settings/sso</c> body: the settings fields plus the write-only
/// secret. A null or blank <see cref="ClientSecret"/> keeps the saved one;
/// <see cref="ClearClientSecret"/> removes it. Nulls aren't sent.
/// </summary>
public sealed record SsoSettingsRequest
{
    public required string Name { get; init; }
    public required string Issuer { get; init; }
    public required string ClientId { get; init; }
    public string? ClientSecret { get; init; }

    /// <summary>True removes the saved secret; null (not sent) leaves it.</summary>
    public bool? ClearClientSecret { get; init; }

    public required string Scopes { get; init; }
    public required string PublicUrl { get; init; }
    public required bool AllowSignup { get; init; }
    public required bool MatchEmail { get; init; }
    public string? RequiredGroup { get; init; }
    public string? TrustedGroup { get; init; }
    public required string GroupsClaim { get; init; }
}

/// <summary><c>POST /settings/sso/test</c> body.</summary>
public sealed record SsoTestRequest(string Issuer);

/// <summary><c>POST /settings/sso/test</c>: what the provider's discovery document says.</summary>
public sealed record SsoTestResult
{
    /// <summary>The issuer exactly as the provider states it.</summary>
    public required string Issuer { get; init; }

    public required string AuthorizationEndpoint { get; init; }
    public required string TokenEndpoint { get; init; }
    public string? UserinfoEndpoint { get; init; }

    /// <summary>Things that work but deserve a look ("The provider isn't using https — …").</summary>
    public IReadOnlyList<string> Warnings { get; init; } = [];
}
