using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json.Nodes;

namespace Marquee.Core.Tests.Support;

/// <summary>
/// A stand-in for the network: answers every request from <see cref="Handler"/>
/// and records what was sent, so a test can assert the method, path, query,
/// headers and JSON body exactly. Pass it as the <c>handler</c> of an
/// <c>ApiClient</c>, <c>ServerSession</c> or <c>ServerProbe.ProbeAsync</c>.
///
/// Without a handler it behaves like a closed port (connection refused).
/// </summary>
public sealed class StubHttpMessageHandler : HttpMessageHandler
{
    public const string ApiHeader = "X-Marquee-API";

    public sealed record RecordedRequest(HttpMethod Method, Uri Uri, IReadOnlyDictionary<string, string> Headers, string? ContentType, string Body)
    {
        /// <summary><c>/api/v1/me</c>.</summary>
        public string Path => Uri.AbsolutePath;

        public string? Header(string name) => Headers.TryGetValue(name, out var value) ? value : null;

        public string? Authorization => Header("Authorization");

        /// <summary>The query, percent-decoded.</summary>
        public IReadOnlyDictionary<string, string> Query => ParseQuery(Uri.Query);

        /// <summary>The body parsed as JSON, or null when no body was sent.</summary>
        public JsonNode? JsonBody => Body.Length == 0 ? null : JsonNode.Parse(Body);

        private static Dictionary<string, string> ParseQuery(string query)
        {
            var result = new Dictionary<string, string>(StringComparer.Ordinal);
            var text = query.StartsWith('?') ? query[1..] : query;
            if (text.Length == 0)
            {
                return result;
            }
            foreach (var pair in text.Split('&'))
            {
                var separator = pair.IndexOf('=');
                var name = separator < 0 ? pair : pair[..separator];
                var value = separator < 0 ? "" : pair[(separator + 1)..];
                result[Uri.UnescapeDataString(name)] = Uri.UnescapeDataString(value);
            }
            return result;
        }
    }

    public List<RecordedRequest> Requests { get; } = [];

    /// <summary>Builds the answer to a request; a fresh HttpResponseMessage each time, since the client disposes it.</summary>
    public Func<RecordedRequest, CancellationToken, Task<HttpResponseMessage>>? Handler { get; set; }

    // MARK: Configuring answers

    public void Answer(Func<RecordedRequest, HttpResponseMessage> handler) =>
        Handler = (request, _) => Task.FromResult(handler(request));

    public void Answer(Func<HttpResponseMessage> make) =>
        Handler = (_, _) => Task.FromResult(make());

    public void AnswerJson(int status, string body, bool apiHeader = true) =>
        Answer(() => Json(status, body, apiHeader));

    public void AnswerFixture(string name) =>
        Answer(() => Fixture(name));

    /// <summary>Every request fails at the transport level with <paramref name="error"/>.</summary>
    public void Fail(Exception error) =>
        Handler = (_, _) => throw error;

    /// <summary>Never answers, so the client's own timeout (or the caller's cancellation) decides.</summary>
    public void Hang() =>
        Handler = async (_, ct) =>
        {
            await Task.Delay(System.Threading.Timeout.Infinite, ct);
            return new HttpResponseMessage(HttpStatusCode.OK);
        };

    // MARK: Canned responses

    public static HttpResponseMessage Json(int status, string body, bool apiHeader = true)
    {
        var response = new HttpResponseMessage((HttpStatusCode)status)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        };
        if (apiHeader)
        {
            response.Headers.TryAddWithoutValidation(ApiHeader, "1");
        }
        return response;
    }

    /// <summary>A 200 with the doc's example response.</summary>
    public static HttpResponseMessage Fixture(string name) => Json(200, Fixtures.Read(name));

    public static HttpResponseMessage Html(int status, string body, bool apiHeader = false) =>
        Text(status, body, "text/html", apiHeader);

    public static HttpResponseMessage Text(int status, string body, string? contentType, bool apiHeader = false)
    {
        var response = new HttpResponseMessage((HttpStatusCode)status)
        {
            Content = contentType == null ? new ByteArrayContent(Encoding.UTF8.GetBytes(body)) : new StringContent(body, Encoding.UTF8, contentType),
        };
        if (contentType == null)
        {
            response.Content.Headers.ContentType = null;
        }
        if (apiHeader)
        {
            response.Headers.TryAddWithoutValidation(ApiHeader, "1");
        }
        return response;
    }

    /// <summary>A body-less answer, as a 204 or an empty 200 from the server (with the API header).</summary>
    public static HttpResponseMessage Empty(int status, bool apiHeader = true)
    {
        var response = new HttpResponseMessage((HttpStatusCode)status) { Content = new ByteArrayContent([]) };
        response.Content.Headers.ContentType = null;
        if (apiHeader)
        {
            response.Headers.TryAddWithoutValidation(ApiHeader, "1");
        }
        return response;
    }

    public static HttpResponseMessage Redirect(int status, string location)
    {
        var response = new HttpResponseMessage((HttpStatusCode)status) { Content = new ByteArrayContent([]) };
        response.Headers.TryAddWithoutValidation("Location", location);
        return response;
    }

    /// <summary>What a closed port looks like to HttpClient.</summary>
    public static Exception ConnectionRefused() =>
        new HttpRequestException(HttpRequestError.ConnectionError, "Connection refused", new SocketException((int)SocketError.ConnectionRefused));

    public static Exception UnknownHost() =>
        new HttpRequestException(HttpRequestError.NameResolutionError, "No such host is known", new SocketException((int)SocketError.HostNotFound));

    // MARK: HttpMessageHandler

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var body = request.Content == null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (name, values) in request.Headers)
        {
            headers[name] = string.Join(", ", values);
        }
        if (request.Content != null)
        {
            foreach (var (name, values) in request.Content.Headers)
            {
                headers[name] = string.Join(", ", values);
            }
        }
        var recorded = new RecordedRequest(request.Method, request.RequestUri!, headers, request.Content?.Headers.ContentType?.ToString(), body);
        lock (Requests)
        {
            Requests.Add(recorded);
        }
        var handler = Handler ?? throw ConnectionRefused();
        return await handler(recorded, cancellationToken);
    }
}
