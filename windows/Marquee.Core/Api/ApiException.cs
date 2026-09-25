using System.Net.Sockets;
using System.Text.Json;
using Marquee.Core.Models;

namespace Marquee.Core.Api;

/// <summary>
/// The only exception an API call throws. <see cref="Exception.Message"/> is
/// always safe to show, with the same wording as the Mac app's
/// <c>APIError.errorDescription</c>; <see cref="ServerMessage"/> is what the
/// server said, when it said anything.
/// </summary>
public sealed class ApiException : Exception
{
    /// <summary>The 409 message that means "offer Manually approve" (api-v1.md, Errors).</summary>
    public const string SonarrUnresolvableMessage = "Couldn't resolve this show for Sonarr.";

    public const string UnreadableResponseMessage = "Your Marquee server sent a response this version of the app couldn't read.";
    public const string InvalidRequestDefaultMessage = "The request was invalid.";

    public ApiErrorKind Kind { get; }

    /// <summary>The server's <c>error</c> string, trimmed; null when the body had none (or for a transport failure).</summary>
    public string? ServerMessage { get; }

    /// <summary>Set for <see cref="ApiErrorKind.Network"/> only.</summary>
    public NetworkFailure? Failure { get; }

    /// <summary>The HTTP status that produced this error, when there was a response.</summary>
    public int? StatusCode { get; }

    /// <summary>
    /// True when the answer carried <c>X-Marquee-API</c>. A 401 from a
    /// reverse proxy in front of the server can look identical in the body,
    /// and must not be taken for the server revoking the token.
    /// </summary>
    public bool HasApiHeader { get; }

    private ApiException(
        ApiErrorKind kind,
        string message,
        string? serverMessage = null,
        NetworkFailure? failure = null,
        int? statusCode = null,
        bool hasApiHeader = false,
        Exception? inner = null)
        : base(message, inner)
    {
        Kind = kind;
        ServerMessage = serverMessage;
        Failure = failure;
        StatusCode = statusCode;
        HasApiHeader = hasApiHeader;
    }

    // MARK: Factories (one per kind, so a call site reads like the Swift cases)

    public static ApiException Unauthorized(int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.Unauthorized, "Your session has ended. Please sign in again.", statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException InvalidCredentials(int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.InvalidCredentials, "Incorrect username or password.", statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException RateLimited(string? message, int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.RateLimited, message ?? "Too many attempts. Try again in a few minutes.", message, statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException Forbidden(int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.Forbidden, "Only an admin can do that.", statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException NotFound(int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.NotFound, "That couldn't be found on your Marquee server.", statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException Conflict(string? message, int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.Conflict, message ?? "That conflicts with something already on your server.", message, statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException SetupComplete(int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.SetupComplete, "Setup has already been completed on this server. Please sign in instead.", statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException Upstream(string? message, int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.Upstream, message ?? "A service connected to your Marquee server didn't respond.", message, statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException Invalid(string message, int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.Invalid, message, message, statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException Server(string? message, int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.Server, message ?? "Your Marquee server ran into a problem. Try again in a moment.", message, statusCode: statusCode, hasApiHeader: hasApiHeader);

    /// <summary>What a Plex sign-in that expired says (410, or past its <c>expiresAt</c>).</summary>
    public const string PlexSignInExpiredMessage = "The Plex sign-in expired. Try again.";

    /// <summary>A refused Plex/Jellyfin sign-in with no reason given.</summary>
    public const string SignInRefusedDefaultMessage = "This account can't sign in to this Marquee server.";

    /// <summary>
    /// 403 from Plex/Jellyfin sign-in or linking: Forbidden, but with the
    /// server's own reason as the message ("This Plex account doesn't have
    /// access to this server.", "Ask the admin to add you first.") instead
    /// of "Only an admin can do that.".
    /// </summary>
    public static ApiException Refused(string? message, int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.Forbidden, message ?? SignInRefusedDefaultMessage, message, statusCode: statusCode, hasApiHeader: hasApiHeader);

    /// <summary>Reads a 403's <c>error</c> as a <see cref="Refused"/>.</summary>
    public static ApiException RefusedFromResponse(int statusCode, string body, bool hasApiHeader = false) =>
        Refused(DecodeBody(body)?.Error?.Trim().NonBlank(), statusCode, hasApiHeader);

    public static ApiException PlexSignInExpired(int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.Expired, PlexSignInExpiredMessage, statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException Network(NetworkFailure failure, string? detail = null, Exception? inner = null) =>
        new(ApiErrorKind.Network, NetworkMessage(failure, detail), failure: failure, inner: inner);

    public static ApiException NotMarquee(int? statusCode = null) =>
        new(ApiErrorKind.NotMarquee, $"The server didn't answer like a Marquee server. It may need updating to {ServerInfo.MinimumServerVersion} or later.", statusCode: statusCode);

    // MARK: Classification

    /// <summary>
    /// Maps a non-2xx answer: the body's <c>code</c> first, then the status,
    /// the same order as <c>APIError.from(statusCode:body:)</c> on the Mac.
    /// Never throws; an HTML error page simply has no code.
    /// </summary>
    public static ApiException FromResponse(int statusCode, string body, bool hasApiHeader = false)
    {
        var decoded = DecodeBody(body);
        var message = decoded?.Error?.Trim().NonBlank();

        switch (decoded?.Code)
        {
            case "unauthorized": return Unauthorized(statusCode, hasApiHeader);
            case "invalid_credentials": return InvalidCredentials(statusCode, hasApiHeader);
            case "rate_limited": return RateLimited(message, statusCode, hasApiHeader);
            case "forbidden": return Forbidden(statusCode, hasApiHeader);
            case "not_found": return NotFound(statusCode, hasApiHeader);
            case "conflict": return Conflict(message, statusCode, hasApiHeader);
            case "setup_complete": return SetupComplete(statusCode, hasApiHeader);
            case "upstream": return Upstream(message, statusCode, hasApiHeader);
            case "invalid": return Invalid(message ?? InvalidRequestDefaultMessage, statusCode, hasApiHeader);
            case "internal": return Server(message, statusCode, hasApiHeader);
        }

        return statusCode switch
        {
            400 => Invalid(message ?? InvalidRequestDefaultMessage, statusCode, hasApiHeader),
            401 => Unauthorized(statusCode, hasApiHeader),
            403 => Forbidden(statusCode, hasApiHeader),
            404 => NotFound(statusCode, hasApiHeader),
            409 => Conflict(message, statusCode, hasApiHeader),
            429 => RateLimited(message, statusCode, hasApiHeader),
            502 => Upstream(message, statusCode, hasApiHeader),
            _ => Server(message, statusCode, hasApiHeader),
        };
    }

    /// <summary>
    /// Wraps a transport-level failure as <see cref="ApiErrorKind.Network"/>.
    /// A cancelled operation is a timeout unless <paramref name="ct"/> itself
    /// was cancelled: the transport's own timeout token is the only other
    /// thing that cancels a request.
    /// </summary>
    public static ApiException Wrap(Exception error, CancellationToken ct = default)
    {
        switch (error)
        {
            case ApiException api:
                return api;
            case OperationCanceledException:
                return ct.IsCancellationRequested
                    ? Network(NetworkFailure.Cancelled, inner: error)
                    : Network(NetworkFailure.Timeout, inner: error);
        }
        var (failure, detail) = Classify(error);
        return Network(failure, detail, error);
    }

    /// <summary>True when the server couldn't be reached at all, as opposed to answering with an error.</summary>
    public bool IsConnectivityFailure => Kind is ApiErrorKind.Network or ApiErrorKind.NotMarquee;

    public bool IsCancellation => Failure == NetworkFailure.Cancelled;

    /// <summary>
    /// The server itself said the token is no good. Only then does the
    /// session drop the saved token; a 401 without the API header came from
    /// something in front of the server.
    /// </summary>
    public bool IsRejectedToken => Kind == ApiErrorKind.Unauthorized && HasApiHeader;

    /// <summary>The 409 that means "offer Manually approve" for a TV request.</summary>
    public bool IsSonarrUnresolvable => Kind == ApiErrorKind.Conflict && ServerMessage == SonarrUnresolvableMessage;

    private static ApiErrorBody? DecodeBody(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return null;
        }
        try
        {
            return JsonSerializer.Deserialize<ApiErrorBody>(body, Json.Options);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string NetworkMessage(NetworkFailure failure, string? detail) => failure switch
    {
        NetworkFailure.Timeout => "Your Marquee server took too long to respond.",
        NetworkFailure.Refused or NetworkFailure.UnknownHost or NetworkFailure.ConnectionLost =>
            "Couldn't reach your Marquee server. Check that it's running and on your network.",
        NetworkFailure.Cancelled => "The request was cancelled.",
        _ => $"Couldn't reach your Marquee server: {detail ?? "unknown error"}",
    };

    /// <summary>
    /// What the socket layer can tell us. The SocketException underneath is
    /// the most precise source (Windows and Linux agree on its codes); the
    /// HttpRequestError category is the fallback when there is none.
    /// </summary>
    private static (NetworkFailure Failure, string? Detail) Classify(Exception error)
    {
        for (var inner = error; inner != null; inner = inner.InnerException)
        {
            if (inner is SocketException socket)
            {
                return socket.SocketErrorCode switch
                {
                    SocketError.ConnectionRefused => (NetworkFailure.Refused, null),
                    SocketError.TimedOut => (NetworkFailure.Timeout, null),
                    SocketError.HostNotFound or SocketError.NoData or SocketError.TryAgain or SocketError.NoRecovery =>
                        (NetworkFailure.UnknownHost, null),
                    SocketError.HostUnreachable or SocketError.NetworkUnreachable or SocketError.NetworkDown
                        or SocketError.ConnectionReset or SocketError.ConnectionAborted or SocketError.Shutdown
                        or SocketError.NotConnected => (NetworkFailure.ConnectionLost, null),
                    SocketError.AccessDenied => (NetworkFailure.AccessDenied, socket.Message),
                    _ => (NetworkFailure.Other, socket.Message),
                };
            }
        }

        if (error is HttpRequestException http)
        {
            return http.HttpRequestError switch
            {
                HttpRequestError.NameResolutionError => (NetworkFailure.UnknownHost, null),
                HttpRequestError.ConnectionError => (NetworkFailure.Refused, null),
                HttpRequestError.ResponseEnded => (NetworkFailure.ConnectionLost, null),
                _ => (NetworkFailure.Other, http.Message),
            };
        }

        if (error is IOException)
        {
            return (NetworkFailure.ConnectionLost, null);
        }

        return (NetworkFailure.Other, error.Message);
    }
}

/// <summary>The wire format of an error body: <c>{"error": "...", "code": "..."}</c>.</summary>
public sealed record ApiErrorBody
{
    public string? Error { get; init; }
    public string? Code { get; init; }
}
