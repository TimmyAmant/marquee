using System.Net.Sockets;
using System.Text.Json;
using Marquee.Core.Localization;
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
    /// <summary>The 409 message that means "offer Manually approve" (api-v1.md, Errors): the server's wire text, compared, never shown by the app itself.</summary>
    public const string SonarrUnresolvableMessage = "Couldn't resolve this show for Sonarr.";

    public static string UnreadableResponseMessage => Loc.Get("Api_UnreadableResponse");
    public static string InvalidRequestDefaultMessage => Loc.Get("Api_InvalidRequest");

    public ApiErrorKind Kind { get; }

    /// <summary>The server's <c>error</c> string, trimmed; null when the body had none (or for a transport failure).</summary>
    public string? ServerMessage { get; }

    /// <summary>
    /// The body's stable <c>reason</c> (0.50+), for the few failures the app
    /// acts on (<see cref="SonarrUnresolvableReason"/>, <c>tmdb_not_configured</c>);
    /// null otherwise and from an older server. Match on this, never on the
    /// text, which is in the account's language.
    /// </summary>
    public string? Reason { get; private set; }

    /// <summary>The <c>reason</c> of a TV approval's 409 that means "offer Manually approve".</summary>
    public const string SonarrUnresolvableReason = "sonarr_unresolved";

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
        new(ApiErrorKind.Unauthorized, Loc.Get("Api_Unauthorized"), statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException InvalidCredentials(int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.InvalidCredentials, Loc.Get("Api_InvalidCredentials"), statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException RateLimited(string? message, int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.RateLimited, message ?? Loc.Get("Api_RateLimited"), message, statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException Forbidden(int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.Forbidden, Loc.Get("Api_Forbidden"), statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException NotFound(int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.NotFound, Loc.Get("Api_NotFound"), statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException Conflict(string? message, int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.Conflict, message ?? Loc.Get("Api_Conflict"), message, statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException SetupComplete(int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.SetupComplete, Loc.Get("Api_SetupComplete"), statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException Upstream(string? message, int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.Upstream, message ?? Loc.Get("Api_Upstream"), message, statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException Invalid(string message, int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.Invalid, message, message, statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException Server(string? message, int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.Server, message ?? Loc.Get("Api_Server"), message, statusCode: statusCode, hasApiHeader: hasApiHeader);

    /// <summary>What a Plex sign-in that expired says (410, or past its <c>expiresAt</c>).</summary>
    public static string PlexSignInExpiredMessage => Loc.Get("Api_PlexSignInExpired");

    /// <summary>A refused Plex/Jellyfin sign-in with no reason given.</summary>
    public static string SignInRefusedDefaultMessage => Loc.Get("Api_SignInRefused");

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

    /// <summary>What a single sign-on sign-in or link that expired says (the server's own wording).</summary>
    public static string SsoSignInExpiredMessage => Loc.Get("Api_SsoSignInExpired");

    /// <summary>What a Quick Connect code that expired says (the server's own wording).</summary>
    public static string QuickConnectExpiredMessage => Loc.Get("Api_QuickConnectExpired");

    /// <summary>A PIN-style sign-in (Plex, single sign-on, Quick Connect) that's gone: 410, or past its <c>expiresAt</c>.</summary>
    public static ApiException SignInExpired(string message, int? statusCode = null, bool hasApiHeader = false) =>
        new(ApiErrorKind.Expired, message, statusCode: statusCode, hasApiHeader: hasApiHeader);

    public static ApiException Network(NetworkFailure failure, string? detail = null, Exception? inner = null) =>
        new(ApiErrorKind.Network, NetworkMessage(failure, detail), failure: failure, inner: inner);

    public static ApiException NotMarquee(int? statusCode = null) =>
        new(ApiErrorKind.NotMarquee, Loc.Format("Api_NotMarquee", ServerInfo.MinimumServerVersion), statusCode: statusCode);

    // MARK: Classification

    /// <summary>
    /// Maps a non-2xx answer: the body's <c>code</c> first, then the status,
    /// the same order as <c>APIError.from(statusCode:body:)</c> on the Mac.
    /// Never throws; an HTML error page simply has no code.
    /// </summary>
    public static ApiException FromResponse(int statusCode, string body, bool hasApiHeader = false)
    {
        var error = ClassifyResponse(statusCode, body, hasApiHeader, out var reason);
        error.Reason = reason;
        return error;
    }

    private static ApiException ClassifyResponse(int statusCode, string body, bool hasApiHeader, out string? reason)
    {
        var decoded = DecodeBody(body);
        reason = decoded?.Reason?.Trim().NonBlank();
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

    /// <summary>
    /// The 409 that means "offer Manually approve" for a TV request: its
    /// <c>reason</c>, or (a server older than 0.50, which sends none and
    /// always writes English) its exact text.
    /// </summary>
    public bool IsSonarrUnresolvable =>
        Kind == ApiErrorKind.Conflict
        && (Reason == SonarrUnresolvableReason || (Reason == null && ServerMessage == SonarrUnresolvableMessage));

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
        NetworkFailure.Timeout => Loc.Get("Api_Timeout"),
        NetworkFailure.Refused or NetworkFailure.UnknownHost or NetworkFailure.ConnectionLost =>
            Loc.Get("Api_Unreachable"),
        NetworkFailure.Cancelled => Loc.Get("Api_Cancelled"),
        _ => Loc.Format("Api_NetworkOther", detail ?? Loc.Get("Api_UnknownError")),
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

    /// <summary>0.50+: a stable machine-readable detail on a few failures (api-v1.md, Errors).</summary>
    public string? Reason { get; init; }
}
