namespace Marquee.Core.Api;

/// <summary>
/// Every failure an API call can end in, mirroring the Mac app's
/// <c>APIError</c> case for case. The server's <c>{error, code}</c> body
/// (api-v1.md, Conventions) picks the kind; the status code is the fallback
/// when a body is missing or unrecognized (a proxy's 502 page, say).
/// </summary>
public enum ApiErrorKind
{
    /// <summary>401 <c>unauthorized</c>: missing, expired or revoked token. Back to sign-in.</summary>
    Unauthorized,

    /// <summary>401 <c>invalid_credentials</c>: a failed login.</summary>
    InvalidCredentials,

    /// <summary>429 <c>rate_limited</c>.</summary>
    RateLimited,

    /// <summary>403 <c>forbidden</c>: a member called an admin-only endpoint.</summary>
    Forbidden,

    /// <summary>404 <c>not_found</c>.</summary>
    NotFound,

    /// <summary>409 <c>conflict</c>.</summary>
    Conflict,

    /// <summary>409 <c>setup_complete</c>: first-run setup after accounts already exist.</summary>
    SetupComplete,

    /// <summary>502 <c>upstream</c>: TMDb, Plex, Sonarr and friends failed; the message names which.</summary>
    Upstream,

    /// <summary>400 <c>invalid</c>: validation failed; the message is safe to show.</summary>
    Invalid,

    /// <summary>500 <c>internal</c>, or a response this app couldn't read.</summary>
    Server,

    /// <summary>The request never got a response.</summary>
    Network,

    /// <summary>Something answered, but not a Marquee v1 API (no <c>X-Marquee-API</c>).</summary>
    NotMarquee,
}

/// <summary>Why a <see cref="ApiErrorKind.Network"/> failure happened, as far as the socket layer could tell.</summary>
public enum NetworkFailure
{
    /// <summary>No answer within the request's timeout.</summary>
    Timeout,

    /// <summary>The caller's cancellation token was cancelled.</summary>
    Cancelled,

    /// <summary>The host is there, but nothing listens on that port (or a proxy's bad gateway page: the app behind it is down).</summary>
    Refused,

    /// <summary>The host name didn't resolve.</summary>
    UnknownHost,

    /// <summary>The connection dropped, or there is no network at all.</summary>
    ConnectionLost,

    /// <summary>The OS refused the connection: for a packaged app, missing local network access.</summary>
    AccessDenied,

    /// <summary>Anything else (a TLS failure, say), with the system's message.</summary>
    Other,
}
