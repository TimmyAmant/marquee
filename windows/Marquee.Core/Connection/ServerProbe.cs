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

    /// <summary>The inline error for manual entry and saved-server checks; null for a usable server.</summary>
    public string? ProblemMessage(ServerAddress address)
    {
        var name = address.DisplayName;
        return this switch
        {
            Marquee => null,
            Legacy => $"Found Marquee at {name}, but the server needs updating to {Models.ServerInfo.MinimumServerVersion} or later to work with the Windows app.",
            Incompatible incompatible => $"The server at {name} runs Marquee {incompatible.Info.Version}, which is newer than this app supports. Update Marquee for Windows.",
            NotMarquee => $"{name} responded, but it isn't a Marquee server. Check the address and port.",
            Unreachable unreachable => unreachable.Reason.Kind switch
            {
                UnreachableReasonKind.Refused => $"Nothing is answering on port {address.EffectivePort} at {address.Host}. Check the port and that Marquee is running.",
                UnreachableReasonKind.NoResponse => $"Couldn't reach {name}. Check the address and that the server is on.",
                UnreachableReasonKind.UnknownHost => $"Couldn't find {address.Host} on your network. Try its IP address instead.",
                UnreachableReasonKind.LocalNetworkDenied => "Windows blocked Marquee from reaching your local network. Check the app's network permissions in Settings.",
                _ => $"Couldn't connect to {name}: {unreachable.Reason.Detail}",
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
            return new ProbeOutcome.Unreachable(UnreachableReason.Failed($"the server returned an error ({statusCode})."));
        }
        return new ProbeOutcome.NotMarquee();
    }

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
