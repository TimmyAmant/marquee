using Marquee.Core.Localization;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Marquee.Core.Api;
using Marquee.Core.Models;

namespace Marquee.Core.Connection;

public enum UnreachableReasonKind
{
    /// <summary>Connection refused: the computer is there, but nothing listens on that port.</summary>
    Refused,

    /// <summary>Timed out, or the host is down.</summary>
    NoResponse,

    /// <summary>The host name didn't resolve (e.g. <c>tower.local</c> isn't on this network).</summary>
    UnknownHost,

    /// <summary>Windows blocked the connection: the app lacks local network access.</summary>
    LocalNetworkDenied,

    /// <summary>
    /// The server (or the reverse proxy in front of it) answered with a 5xx:
    /// a Marquee server that errored, or a 502/503/504 from a proxy whose
    /// Marquee is down, which is what a restarting container looks like.
    /// <see cref="UnreachableReason.Detail"/> is the status code.
    /// </summary>
    ServerError,

    /// <summary>Anything else (TLS failure, ...), with the system's message.</summary>
    Failed,
}

/// <summary>Why a server couldn't be reached; each gets its own explanation in the UI.</summary>
public sealed record UnreachableReason(UnreachableReasonKind Kind, string? Detail = null)
{
    public static readonly UnreachableReason Refused = new(UnreachableReasonKind.Refused);
    public static readonly UnreachableReason NoResponse = new(UnreachableReasonKind.NoResponse);
    public static readonly UnreachableReason UnknownHost = new(UnreachableReasonKind.UnknownHost);
    public static readonly UnreachableReason LocalNetworkDenied = new(UnreachableReasonKind.LocalNetworkDenied);

    public static UnreachableReason Failed(string message) => new(UnreachableReasonKind.Failed, message);

    public static UnreachableReason ServerError(int statusCode) =>
        new(UnreachableReasonKind.ServerError, statusCode.ToString(CultureInfo.InvariantCulture));
}

/// <summary>What answered at an address.</summary>
public abstract record ProbeOutcome
{
    private ProbeOutcome()
    {
    }

    /// <summary>A Marquee server with the API version this app speaks.</summary>
    public sealed record Marquee(ServerInfo Info) : ProbeOutcome;

    /// <summary>
    /// A Marquee server older than 0.22.0: no v1 API, so <c>/api/v1/server-info</c>
    /// redirected to the <c>/login</c> HTML page.
    /// </summary>
    public sealed record Legacy : ProbeOutcome;

    /// <summary>A Marquee server speaking an API version this app doesn't know.</summary>
    public sealed record Incompatible(ServerInfo Info) : ProbeOutcome;

    /// <summary>Something answered, but it isn't Marquee.</summary>
    public sealed record NotMarquee : ProbeOutcome;

    public sealed record Unreachable(UnreachableReason Reason) : ProbeOutcome;

    public ServerInfo? ServerInfo => this is Marquee marquee ? marquee.Info : null;

    /// <summary>
    /// What a server that's restarting or updating looks like from here:
    /// nothing listening yet, no answer, or an error page while it boots.
    /// For a saved server this means "wait for it", not "check the address".
    /// </summary>
    public bool IsTemporaryOutage => this is Unreachable
    {
        Reason.Kind: UnreachableReasonKind.Refused or UnreachableReasonKind.NoResponse or UnreachableReasonKind.ServerError,
    };

    /// <summary>The inline error for manual entry and saved-server checks; null for a usable server.</summary>
    /// <param name="saved">
    /// The address is the saved server, which worked before: an outage isn't
    /// blamed on the port or the address.
    /// </param>
    public string? ProblemMessage(ServerAddress address, bool saved = false)
    {
        var name = address.DisplayName;
        if (saved && IsTemporaryOutage)
        {
            return Loc.Format("Server_ProbeSavedOutage", name);
        }
        return this switch
        {
            Marquee => null,
            Legacy => Loc.Format("Server_ProbeLegacy", name, Models.ServerInfo.MinimumServerVersion),
            Incompatible incompatible => Loc.Format("Server_ProbeTooNew", name, incompatible.Info.Version),
            NotMarquee => Loc.Format("Server_ProbeNotMarquee", name),
            Unreachable unreachable => unreachable.Reason.Kind switch
            {
                UnreachableReasonKind.Refused => Loc.Format("Server_ProbeRefused", address.EffectivePort, address.Host),
                UnreachableReasonKind.NoResponse => Loc.Format("Server_ProbeNoResponse", name),
                UnreachableReasonKind.UnknownHost => Loc.Format("Server_ProbeUnknownHost", address.Host),
                UnreachableReasonKind.LocalNetworkDenied => Loc.Get("Server_ProbeLocalNetworkDenied"),
                UnreachableReasonKind.ServerError => Loc.Format("Server_ProbeServerErrorStatus", name, unreachable.Reason.Detail),
                _ => Loc.Format("Server_ProbeOther", name, unreachable.Reason.Detail),
            },
            _ => null,
        };
    }
}

/// <summary>
/// Identifies whatever is listening at an address by asking for
/// <c>/api/v1/server-info</c>, the same check discovery runs on every open port.
/// </summary>
public static class ServerProbe
{
    public const string InfoPath = "/server-info";
    public const string LegacyLoginPath = "/login";
    public static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(6);

    private static readonly Regex MarqueeTitle = new(@"<title[^>]*>\s*Marquee\s*</title>", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    /// <summary>
    /// Full check for a single address (manual entry, saved server). Sends
    /// no credentials: the answer must not depend on who is asking.
    /// </summary>
    /// <param name="handler">Tests pass a stub; the app leaves it null for the shared pool.</param>
    public static async Task<ProbeOutcome> ProbeAsync(
        ServerAddress address,
        HttpMessageHandler? handler = null,
        TimeSpan? timeout = null,
        CancellationToken ct = default)
    {
        var client = new ApiClient(address.BaseUrl, handler: handler);
        var requestTimeout = timeout ?? RequestTimeout;

        ApiClient.RawResponse raw;
        try
        {
            raw = await client.SendRawAsync(HttpMethod.Get, InfoPath, timeout: requestTimeout, ct: ct).ConfigureAwait(false);
        }
        catch (ApiException error)
        {
            if (error.IsCancellation)
            {
                ct.ThrowIfCancellationRequested();
            }
            return new ProbeOutcome.Unreachable(UnreachableReasonFor(error));
        }

        // A legacy server answers with a redirect to its HTML login page. The
        // transport never follows redirects, so the probe takes that one hop
        // itself, and only on the same host: it is the page's <title> that
        // proves this is Marquee, not the redirect (plenty of apps have a
        // /login).
        if (raw.IsRedirect && LoginPageUrl(address, raw.Location) is { } loginPage)
        {
            try
            {
                var page = await client.SendRawAsync(HttpMethod.Get, loginPage, timeout: requestTimeout, ct: ct).ConfigureAwait(false);
                return IsLegacyMarqueePage(page.ContentType, page.Body) ? new ProbeOutcome.Legacy() : new ProbeOutcome.NotMarquee();
            }
            catch (ApiException error)
            {
                if (error.IsCancellation)
                {
                    ct.ThrowIfCancellationRequested();
                }
                return new ProbeOutcome.Unreachable(UnreachableReasonFor(error));
            }
        }

        return Classify(raw.StatusCode, raw.ContentType, raw.HasApiHeader, raw.Body);
    }

    /// <summary>
    /// Pure classification of a server-info response, so it's unit-testable
    /// from canned bodies.
    /// </summary>
    public static ProbeOutcome Classify(int statusCode, string? contentType, bool hasApiHeader, byte[] body)
    {
        if (statusCode is >= 200 and < 300 && DecodeInfo(body) is { IsMarquee: true } info)
        {
            return info.IsSupported ? new ProbeOutcome.Marquee(info) : new ProbeOutcome.Incompatible(info);
        }
        if (IsLegacyMarqueePage(contentType, body))
        {
            return new ProbeOutcome.Legacy();
        }
        if (hasApiHeader)
        {
            // A v1 server that failed to answer server-info (it's meant to
            // return 200 even when degraded): it's ours, but not usable now.
            return statusCode >= 500
                ? new ProbeOutcome.Unreachable(UnreachableReason.ServerError(statusCode))
                : new ProbeOutcome.Unreachable(UnreachableReason.Failed(Loc.Format("Server_ProbeServerError", statusCode)));
        }
        if (IsGatewayOutage(statusCode))
        {
            // A reverse proxy answering for a Marquee that's down (a container
            // restarting after an update): no X-Marquee-API, but not "some
            // other app" either.
            return new ProbeOutcome.Unreachable(UnreachableReason.ServerError(statusCode));
        }
        return new ProbeOutcome.NotMarquee();
    }

    /// <summary>502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout: what a proxy says while the app behind it is down.</summary>
    public static bool IsGatewayOutage(int statusCode) => statusCode is >= 502 and <= 504;

    /// <summary>
    /// Legacy servers answer every unknown route with the web app's HTML,
    /// whose root layout sets <c>&lt;title&gt;Marquee&lt;/title&gt;</c> (app/layout.tsx).
    /// </summary>
    public static bool IsLegacyMarqueePage(string? contentType, byte[] body)
    {
        var head = Encoding.UTF8.GetString(body, 0, Math.Min(body.Length, 256_000));
        var looksLikeHtml = contentType?.Contains("html", StringComparison.OrdinalIgnoreCase) == true
            || head.Contains("<html", StringComparison.OrdinalIgnoreCase);
        return looksLikeHtml && MarqueeTitle.IsMatch(head);
    }

    public static UnreachableReason UnreachableReasonFor(ApiException error)
    {
        if (error.Kind != ApiErrorKind.Network)
        {
            return UnreachableReason.Failed(error.Message);
        }
        return error.Failure switch
        {
            NetworkFailure.Refused => UnreachableReason.Refused,
            NetworkFailure.Timeout or NetworkFailure.ConnectionLost => UnreachableReason.NoResponse,
            NetworkFailure.UnknownHost => UnreachableReason.UnknownHost,
            NetworkFailure.AccessDenied => UnreachableReason.LocalNetworkDenied,
            _ => UnreachableReason.Failed(error.Message),
        };
    }

    /// <summary>The redirect target when it is this server's own <c>/login</c>; null for anywhere else.</summary>
    private static Uri? LoginPageUrl(ServerAddress address, string? location)
    {
        if (string.IsNullOrEmpty(location) || !Uri.TryCreate(address.BaseUrl, location, out var target))
        {
            return null;
        }
        var sameOrigin = string.Equals(
            target.GetLeftPart(UriPartial.Authority),
            address.BaseUrl.GetLeftPart(UriPartial.Authority),
            StringComparison.OrdinalIgnoreCase);
        return sameOrigin && string.Equals(target.AbsolutePath, LegacyLoginPath, StringComparison.OrdinalIgnoreCase) ? target : null;
    }

    private static ServerInfo? DecodeInfo(byte[] body)
    {
        try
        {
            return JsonSerializer.Deserialize<ServerInfo>(body, Json.Options);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
