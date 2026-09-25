using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Marquee.Core.Models;

namespace Marquee.Core.Api;

/// <summary>
/// JSON client for one Marquee server's <c>/api/v1</c>. Immutable: the
/// session hands out a fresh one carrying the current token, so an in-flight
/// request never picks up a token that changed under it.
///
/// Every method throws <see cref="ApiException"/>, and only
/// <see cref="ApiException"/>.
/// </summary>
public sealed class ApiClient
{
    /// <summary>
    /// The contract's token shape, <c>mqt_</c> plus 43 base64url characters.
    /// Anything else (a corrupted credential entry, a hostile server's
    /// answer with a newline in it) is treated as no token at all rather
    /// than handed to the header parser, which would throw a FormatException
    /// past the "only ApiException" guarantee on every call.
    /// </summary>
    public static bool IsWellFormedToken(string? token) =>
        token is { Length: 47 } && token.StartsWith("mqt_", StringComparison.Ordinal)
        && token.AsSpan(4).IndexOfAnyExcept("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_") < 0;

    public const string ApiHeader = "X-Marquee-API";
    public const string BasePath = "/api/v1";
    public static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(15);

    /// <summary>
    /// The most a response body may be. The largest legitimate answer, a
    /// browse page, is tens of kilobytes; the cap is for whatever else may
    /// be listening at a saved address (a proxy's error page, something
    /// hostile streaming a gzip bomb), which would otherwise be buffered
    /// whole up to HttpClient's default of 2 GB, on every badge poll. Past
    /// the cap the send fails with an HttpRequestException, which
    /// <see cref="ApiException.Wrap"/> reports as a Network failure.
    /// </summary>
    public const int MaxResponseBytes = 16 * 1024 * 1024;

    /// <summary>
    /// The one connection pool every client shares. Redirects are never
    /// followed (a token or password must never be re-sent wherever a
    /// proxy points), cookies are never kept (the bearer token is the only
    /// credential, and a web session cookie must not change what the server
    /// answers).
    /// </summary>
    public static HttpMessageHandler DefaultHandler { get; } = CreateHandler();

    public static SocketsHttpHandler CreateHandler() => new()
    {
        AllowAutoRedirect = false,
        UseCookies = false,
        AutomaticDecompression = DecompressionMethods.All,
        // Re-resolve the server now and then, so a DNS change on the LAN
        // doesn't pin the app to a dead address for the whole session.
        PooledConnectionLifetime = TimeSpan.FromMinutes(5),
    };

    public Uri BaseUrl { get; }
    public string? Token { get; }

    /// <summary>
    /// Awaited before an <see cref="ApiErrorKind.Unauthorized"/> error is
    /// thrown from a call that sent a token and was answered by the server
    /// itself, so the session can drop back to sign-in wherever the 401
    /// came from.
    /// </summary>
    public Func<Task>? OnUnauthorized { get; }

    private readonly HttpClient http;

    /// <param name="baseUrl">The server root, e.g. <c>http://192.168.1.20:3000</c>; <see cref="BasePath"/> is appended.</param>
    /// <param name="token">The bearer token, or null for the public endpoints.</param>
    /// <param name="handler">Tests pass a stub; the app leaves it null for <see cref="DefaultHandler"/>.</param>
    public ApiClient(Uri baseUrl, string? token = null, HttpMessageHandler? handler = null, Func<Task>? onUnauthorized = null)
    {
        BaseUrl = baseUrl;
        Token = token;
        OnUnauthorized = onUnauthorized;
        // Per-request timeouts are applied through a cancellation token, so
        // the client's own timer is off; it would otherwise cap long calls
        // ("Run now", Plex's first sync) at its default 100 seconds.
        http = new HttpClient(handler ?? DefaultHandler, disposeHandler: false)
        {
            Timeout = System.Threading.Timeout.InfiniteTimeSpan,
            MaxResponseContentBufferSize = MaxResponseBytes,
        };
    }

    // MARK: Verbs

    public Task<T> GetAsync<T>(string path, IReadOnlyDictionary<string, string?>? query = null, TimeSpan? timeout = null, CancellationToken ct = default) =>
        SendAsync<T>(HttpMethod.Get, path, query, null, timeout, ct);

    public Task<T> PostAsync<T>(string path, object? body = null, TimeSpan? timeout = null, CancellationToken ct = default) =>
        SendAsync<T>(HttpMethod.Post, path, null, body, timeout, ct);

    public Task<T> PutAsync<T>(string path, object? body = null, TimeSpan? timeout = null, CancellationToken ct = default) =>
        SendAsync<T>(HttpMethod.Put, path, null, body, timeout, ct);

    public Task<T> PatchAsync<T>(string path, object? body = null, TimeSpan? timeout = null, CancellationToken ct = default) =>
        SendAsync<T>(HttpMethod.Patch, path, null, body, timeout, ct);

    public Task<T> DeleteAsync<T>(string path, IReadOnlyDictionary<string, string?>? query = null, TimeSpan? timeout = null, CancellationToken ct = default) =>
        SendAsync<T>(HttpMethod.Delete, path, query, null, timeout, ct);

    // MARK: Transport

    /// <summary>
    /// Sends one request and decodes the answer.
    /// </summary>
    /// <param name="path">Relative to <c>/api/v1</c>, e.g. <c>"/me"</c>, with its segments already percent-encoded.</param>
    /// <param name="query">Query values, percent-encoded here; a null value leaves its key out.</param>
    /// <param name="body">Encoded as JSON with <see cref="Json.RequestOptions"/>; null sends no body.</param>
    /// <param name="timeout">Defaults to <see cref="RequestTimeout"/>.</param>
    public async Task<T> SendAsync<T>(
        HttpMethod method,
        string path,
        IReadOnlyDictionary<string, string?>? query = null,
        object? body = null,
        TimeSpan? timeout = null,
        CancellationToken ct = default)
    {
        var raw = await SendRawAsync(method, path, query, body, timeout, ct).ConfigureAwait(false);

        if (raw.IsRedirect)
        {
            // A legacy server (or a login proxy) redirecting to an HTML page.
            throw ApiException.NotMarquee(raw.StatusCode);
        }
        if (!raw.HasApiHeader && !raw.IsJson)
        {
            // A reverse proxy's "bad gateway" page means the server is down,
            // not that it's the wrong kind of server.
            if (raw.StatusCode is >= 502 and <= 504)
            {
                throw ApiException.Network(NetworkFailure.Refused, $"the proxy answered {raw.StatusCode}");
            }
            throw ApiException.NotMarquee(raw.StatusCode);
        }

        if (!raw.IsSuccess)
        {
            var error = ApiException.FromResponse(raw.StatusCode, raw.BodyText, raw.HasApiHeader);
            if (error.IsRejectedToken && Token != null && OnUnauthorized != null)
            {
                await OnUnauthorized().ConfigureAwait(false);
            }
            throw error;
        }

        if (raw.Body.Length == 0 && typeof(T) == typeof(EmptyResponse))
        {
            return default!;
        }
        try
        {
            return JsonSerializer.Deserialize<T>(raw.Body, Json.Options) ?? throw ApiException.Server(ApiException.UnreadableResponseMessage, raw.StatusCode, raw.HasApiHeader);
        }
        catch (Exception decodeError) when (decodeError is JsonException or NotSupportedException)
        {
            throw ApiException.Server(ApiException.UnreadableResponseMessage, raw.StatusCode, raw.HasApiHeader);
        }
    }

    /// <summary>
    /// The undecoded answer, for callers that classify a response themselves
    /// (the server probe, which must tell a legacy server's redirect from a
    /// stranger). Transport failures still become <see cref="ApiException"/>.
    /// </summary>
    public Task<RawResponse> SendRawAsync(
        HttpMethod method,
        string path,
        IReadOnlyDictionary<string, string?>? query = null,
        object? body = null,
        TimeSpan? timeout = null,
        CancellationToken ct = default) =>
        SendRawAsync(method, BuildUrl(path, query), body, timeout, ct);

    /// <summary>The same for an absolute URL (following a probe's redirect on the same host).</summary>
    public async Task<RawResponse> SendRawAsync(HttpMethod method, Uri url, object? body = null, TimeSpan? timeout = null, CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(method, url);
        request.Headers.TryAddWithoutValidation("Accept", "application/json");
        request.Headers.TryAddWithoutValidation("User-Agent", AppInfo.UserAgent);
        if (Token != null)
        {
            if (!IsWellFormedToken(Token))
            {
                throw ApiException.Unauthorized();
            }
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Token);
        }
        if (body != null)
        {
            request.Content = new ByteArrayContent(Encode(body));
            request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        }

        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutSource.CancelAfter(timeout ?? RequestTimeout);

        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(request, HttpCompletionOption.ResponseContentRead, timeoutSource.Token).ConfigureAwait(false);
        }
        catch (Exception error) when (error is not ApiException)
        {
            throw ApiException.Wrap(error, ct);
        }

        using (response)
        {
            byte[] bytes;
            try
            {
                bytes = await response.Content.ReadAsByteArrayAsync(timeoutSource.Token).ConfigureAwait(false);
            }
            catch (Exception error) when (error is not ApiException)
            {
                throw ApiException.Wrap(error, ct);
            }
            return new RawResponse(
                (int)response.StatusCode,
                response.Headers.Contains(ApiHeader),
                response.Content.Headers.ContentType?.MediaType,
                response.Headers.Location?.OriginalString,
                bytes);
        }
    }

    /// <summary>An answer before any interpretation.</summary>
    public readonly record struct RawResponse(int StatusCode, bool HasApiHeader, string? ContentType, string? Location, byte[] Body)
    {
        public bool IsSuccess => StatusCode is >= 200 and < 300;
        public bool IsRedirect => StatusCode is >= 300 and < 400;
        public bool IsJson => ContentType?.Contains("json", StringComparison.OrdinalIgnoreCase) == true;
        public string BodyText => Encoding.UTF8.GetString(Body);
    }

    // MARK: URLs and bodies

    private Uri BuildUrl(string path, IReadOnlyDictionary<string, string?>? query)
    {
        var normalizedPath = path.StartsWith('/') ? path : "/" + path;
        var text = new StringBuilder(BaseUrl.GetLeftPart(UriPartial.Authority));
        text.Append(BasePath).Append(normalizedPath);

        if (query is { Count: > 0 })
        {
            // Sorted so the same query always produces the same URL, and
            // encoded like encodeURIComponent: a "+" in a search stays a
            // plus ("Romeo + Juliet") instead of turning into a space.
            var pairs = query
                .Where(pair => pair.Value != null)
                .OrderBy(pair => pair.Key, StringComparer.Ordinal)
                .Select(pair => Uri.EscapeDataString(pair.Key) + "=" + Uri.EscapeDataString(pair.Value!))
                .ToList();
            if (pairs.Count > 0)
            {
                text.Append('?').Append(string.Join("&", pairs));
            }
        }

        return Uri.TryCreate(text.ToString(), UriKind.Absolute, out var url)
            ? url
            : throw ApiException.Invalid($"Invalid request path: {path}");
    }

    private static byte[] Encode(object body)
    {
        try
        {
            return Json.EncodeBody(body);
        }
        catch (Exception error) when (error is JsonException or NotSupportedException or InvalidOperationException)
        {
            throw ApiException.Invalid($"Couldn't encode the request: {error.Message}");
        }
    }
}
