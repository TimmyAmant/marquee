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

    /// <summary>What every JSON call asks for.</summary>
    public const string JsonAccept = "application/json";

    /// <summary>
    /// The most of an error body read from a streaming answer (<see cref="OpenStreamAsync"/>);
    /// the contract's error JSON is a few hundred bytes.
    /// </summary>
    private const int MaxStreamErrorBytes = 64 * 1024;

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
        return await DecodeAsync<T>(raw).ConfigureAwait(false);
    }

    /// <summary>
    /// Sends a raw body (a photo for <c>PUT /users/{id}/avatar</c>) with its
    /// own content type, and decodes the JSON answer like <see cref="SendAsync{T}"/>.
    /// </summary>
    /// <param name="contentType">The body's media type, e.g. <c>image/jpeg</c>; one that doesn't parse is Invalid, before anything is sent.</param>
    public async Task<T> SendBytesAsync<T>(
        HttpMethod method,
        string path,
        byte[] body,
        string contentType,
        TimeSpan? timeout = null,
        CancellationToken ct = default)
    {
        if (!MediaTypeHeaderValue.TryParse(contentType, out var mediaType))
        {
            throw ApiException.Invalid($"Invalid content type: {contentType}");
        }
        var content = new ByteArrayContent(body);
        content.Headers.ContentType = mediaType;
        var raw = await SendCoreAsync(method, BuildUrl(path, null), content, JsonAccept, timeout, ct).ConfigureAwait(false);
        return await DecodeAsync<T>(raw).ConfigureAwait(false);
    }

    /// <summary>
    /// <c>GET</c> of a path the server handed out, such as an
    /// <c>avatarUrl</c> (<c>/api/v1/users/{id}/avatar?v=…</c>), answered with
    /// the raw bytes (the JPEG). The path must be under <c>/api/v1</c> on
    /// this same server; anything else is Invalid and nothing is sent, so a
    /// hostile answer can't have the token carried somewhere else. A 404 is
    /// NotFound (no photo, or not yours to see).
    /// </summary>
    public async Task<byte[]> GetBytesAsync(string serverPath, TimeSpan? timeout = null, CancellationToken ct = default)
    {
        var url = ResolveServerPath(serverPath);
        var raw = await SendCoreAsync(HttpMethod.Get, url, null, "image/*, application/json", timeout, ct).ConfigureAwait(false);
        if (!raw.IsSuccess)
        {
            // The image route answers a missing photo with a bare 404 (no
            // body, no API header), so this classifies by status as well as
            // by code instead of calling a header-less answer a stranger.
            await ThrowFailureAsync(raw).ConfigureAwait(false);
        }
        return raw.Body;
    }

    /// <summary>
    /// Opens a long-lived <c>GET</c> (<c>/notifications/stream</c>) and hands
    /// back its body as it arrives. <paramref name="headersTimeout"/> bounds
    /// only the wait for the response headers; after that the request has
    /// no timeout at all, and the caller decides when a quiet connection is
    /// dead. A non-2xx answer throws the same <see cref="ApiException"/> a
    /// JSON call would (a rejected token signs the session out); a 2xx that
    /// isn't <paramref name="accept"/> is NotMarquee (a captive portal, a
    /// proxy's page).
    /// </summary>
    /// <param name="accept">The media type expected, e.g. <c>text/event-stream</c>.</param>
    public async Task<StreamingResponse> OpenStreamAsync(
        string path,
        string accept,
        TimeSpan? headersTimeout = null,
        CancellationToken ct = default)
    {
        using var request = CreateRequest(HttpMethod.Get, BuildUrl(path, null), accept);
        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutSource.CancelAfter(headersTimeout ?? RequestTimeout);

        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeoutSource.Token).ConfigureAwait(false);
        }
        catch (Exception error) when (error is not ApiException)
        {
            throw ApiException.Wrap(error, ct);
        }

        try
        {
            var status = (int)response.StatusCode;
            var mediaType = response.Content.Headers.ContentType?.MediaType;
            if (status is < 200 or >= 300)
            {
                var errorBody = await ReadPrefixAsync(response.Content, MaxStreamErrorBytes, timeoutSource.Token).ConfigureAwait(false);
                await ThrowFailureAsync(new RawResponse(
                    status,
                    response.Headers.Contains(ApiHeader),
                    mediaType,
                    response.Headers.Location?.OriginalString,
                    errorBody)).ConfigureAwait(false);
            }
            if (!string.Equals(mediaType, accept, StringComparison.OrdinalIgnoreCase))
            {
                throw ApiException.NotMarquee(status);
            }
            var body = await response.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
            return new StreamingResponse(response, body);
        }
        catch (Exception error)
        {
            response.Dispose();
            if (error is ApiException)
            {
                throw;
            }
            throw ApiException.Wrap(error, ct);
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
        HttpContent? content = null;
        if (body != null)
        {
            content = new ByteArrayContent(Encode(body));
            content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        }
        return await SendCoreAsync(method, url, content, JsonAccept, timeout, ct).ConfigureAwait(false);
    }

    /// <summary>One buffered round trip; <paramref name="content"/> goes with the request and is disposed with it.</summary>
    private async Task<RawResponse> SendCoreAsync(HttpMethod method, Uri url, HttpContent? content, string accept, TimeSpan? timeout, CancellationToken ct)
    {
        using var request = CreateRequest(method, url, accept, content);

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

    /// <summary>
    /// The headers every request carries. <paramref name="content"/> belongs
    /// to the request from here on, and is disposed with it even when this throws.
    /// </summary>
    private HttpRequestMessage CreateRequest(HttpMethod method, Uri url, string accept, HttpContent? content = null)
    {
        var request = new HttpRequestMessage(method, url) { Content = content };
        request.Headers.TryAddWithoutValidation("Accept", accept);
        request.Headers.TryAddWithoutValidation("User-Agent", AppInfo.UserAgent);
        if (Token != null)
        {
            if (!IsWellFormedToken(Token))
            {
                request.Dispose();
                throw ApiException.Unauthorized();
            }
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Token);
        }
        return request;
    }

    /// <summary>
    /// Like <see cref="SendAsync{T}"/>, but hands back every 2xx answer, and
    /// the non-2xx ones in <paramref name="accepting"/>, undecoded: for calls
    /// whose statuses carry meaning of their own (a Plex sign-in poll's
    /// 202 / 403 / 410). Any other answer throws exactly as
    /// <see cref="SendAsync{T}"/> would; decode a body with <see cref="Decode{T}"/>.
    /// </summary>
    public async Task<RawResponse> ExchangeAsync(
        HttpMethod method,
        string path,
        object? body = null,
        IReadOnlyCollection<int>? accepting = null,
        TimeSpan? timeout = null,
        CancellationToken ct = default)
    {
        var raw = await SendRawAsync(method, path, null, body, timeout, ct).ConfigureAwait(false);
        EnsureMarquee(raw);
        if (!raw.IsSuccess && accepting?.Contains(raw.StatusCode) != true)
        {
            await ThrowFailureAsync(raw).ConfigureAwait(false);
        }
        return raw;
    }

    /// <summary>A body as <typeparamref name="T"/>; one this app can't read is Server.</summary>
    public static T Decode<T>(RawResponse raw)
    {
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

    /// <summary>The JSON contract's reading of an answer: its value on success, else the error it stands for.</summary>
    private async Task<T> DecodeAsync<T>(RawResponse raw)
    {
        EnsureMarquee(raw);
        if (!raw.IsSuccess)
        {
            await ThrowFailureAsync(raw).ConfigureAwait(false);
        }
        return Decode<T>(raw);
    }

    /// <summary>Throws unless the answer came from a Marquee v1 API (or a proxy saying it's down).</summary>
    private static void EnsureMarquee(RawResponse raw)
    {
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
    }

    /// <summary>
    /// Throws the error a non-2xx answer stands for, after letting the
    /// session drop a token the server itself rejected.
    /// </summary>
    private async Task ThrowFailureAsync(RawResponse raw)
    {
        if (raw.IsRedirect)
        {
            throw ApiException.NotMarquee(raw.StatusCode);
        }
        var error = ApiException.FromResponse(raw.StatusCode, raw.BodyText, raw.HasApiHeader);
        if (error.IsRejectedToken && Token != null && OnUnauthorized != null)
        {
            await OnUnauthorized().ConfigureAwait(false);
        }
        throw error;
    }

    /// <summary>Up to <paramref name="limit"/> bytes of a body, for an error answer that is never read whole.</summary>
    private static async Task<byte[]> ReadPrefixAsync(HttpContent content, int limit, CancellationToken ct)
    {
        await using var stream = await content.ReadAsStreamAsync(ct).ConfigureAwait(false);
        var buffer = new byte[limit];
        var total = 0;
        while (total < limit)
        {
            var read = await stream.ReadAsync(buffer.AsMemory(total, limit - total), ct).ConfigureAwait(false);
            if (read == 0)
            {
                break;
            }
            total += read;
        }
        return buffer[..total];
    }

    /// <summary>An answer before any interpretation.</summary>
    public readonly record struct RawResponse(int StatusCode, bool HasApiHeader, string? ContentType, string? Location, byte[] Body)
    {
        public bool IsSuccess => StatusCode is >= 200 and < 300;
        public bool IsRedirect => StatusCode is >= 300 and < 400;
        public bool IsJson => ContentType?.Contains("json", StringComparison.OrdinalIgnoreCase) == true;
        public string BodyText => Encoding.UTF8.GetString(Body);
    }

    /// <summary>
    /// An answer being read as it arrives (<see cref="OpenStreamAsync"/>).
    /// Disposing it closes the connection.
    /// </summary>
    public sealed class StreamingResponse : IDisposable
    {
        private readonly HttpResponseMessage response;

        internal StreamingResponse(HttpResponseMessage response, Stream body)
        {
            this.response = response;
            Body = body;
        }

        public Stream Body { get; }

        public void Dispose()
        {
            Body.Dispose();
            response.Dispose();
        }
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

    /// <summary>
    /// A server-relative path the server handed out (an <c>avatarUrl</c>) as
    /// an absolute URL on this server. It has to stay under <c>/api/v1</c>
    /// here: a path that would leave the server (<c>//elsewhere/…</c>, an
    /// absolute URL for another host) or climb out of the API
    /// (<c>/api/v1/../…</c>) is Invalid, so the bearer token only ever goes
    /// where the other calls send it.
    /// </summary>
    private Uri ResolveServerPath(string path)
    {
        var origin = BaseUrl.GetLeftPart(UriPartial.Authority);
        Uri? url = null;
        if (path.StartsWith('/'))
        {
            if (!path.StartsWith("//", StringComparison.Ordinal) && !path.Contains('\\'))
            {
                Uri.TryCreate(origin + path, UriKind.Absolute, out url);
            }
        }
        else
        {
            Uri.TryCreate(path, UriKind.Absolute, out url);
        }
        if (url == null
            || !string.Equals(url.GetLeftPart(UriPartial.Authority), origin, StringComparison.OrdinalIgnoreCase)
            || !url.AbsolutePath.StartsWith(BasePath + "/", StringComparison.Ordinal))
        {
            throw ApiException.Invalid($"Invalid server path: {path}");
        }
        return url;
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
