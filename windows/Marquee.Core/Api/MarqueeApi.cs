using Marquee.Core.Models;

namespace Marquee.Core.Api;

// The typed /api/v1 layer: one async method per endpoint in docs/api-v1.md
// (all 81), namespaced by area, the same shape as the Mac app's MarqueeAPI:
//
//     var detail = await api.Titles.DetailAsync(MediaType.Movie, 603);
//     await api.Requests.ApproveAsync(request.Id);
//     var pin = await api.Integrations.Plex.StartPinAsync();
//
// Every method throws ApiException (a 401 also signs the session out).
// {"results": [...]} lists come back as IReadOnlyList<T> and {"ok": true}
// actions as a plain Task. Each area is a partial file
// (MarqueeApi.<Area>.cs) that adds an endpoints class and the property that
// exposes it.

/// <summary>
/// The typed API over an <see cref="ApiClient"/>. A cheap value to create:
/// the session builds one per use so it always carries the current token.
/// </summary>
public sealed partial class MarqueeApi
{
    /// <summary>
    /// Per-request timeouts. The transport has no overall cap, so the
    /// long-running ones can actually finish.
    /// </summary>
    public static class Timeouts
    {
        public static readonly TimeSpan Standard = ApiClient.RequestTimeout;

        /// <summary>TMDb-backed pages: a cold cache fans out to many TMDb calls.</summary>
        public static readonly TimeSpan Tmdb = TimeSpan.FromSeconds(45);

        /// <summary>Calls that test or sync a connected service before answering.</summary>
        public static readonly TimeSpan Integrations = TimeSpan.FromSeconds(60);

        /// <summary>Plex's first sync, "Run now", "Sync now", "Approve all".</summary>
        public static readonly TimeSpan LongRunning = TimeSpan.FromSeconds(600);

        /// <summary>A photo upload: up to 15 MB, which the server then crops and re-encodes.</summary>
        public static readonly TimeSpan Upload = TimeSpan.FromSeconds(120);
    }

    internal readonly Transport transport;

    /// <param name="client">Null when no server is selected; every call then throws <see cref="ApiErrorKind.Unauthorized"/>.</param>
    /// <param name="events">Bumped after each successful mutation (null: nothing to notify).</param>
    public MarqueeApi(ApiClient? client, ServerEvents? events = null)
    {
        transport = new Transport(client, events);
    }

    public ApiClient? Client => transport.Client;
    public ServerEvents? Events => transport.Events;

    // MARK: Transport

    /// <summary>
    /// Sends through the session's <see cref="ApiClient"/> and records
    /// mutations once they've succeeded. Endpoint classes take one of these.
    /// </summary>
    public sealed class Transport
    {
        public ApiClient? Client { get; }
        public ServerEvents? Events { get; }

        public Transport(ApiClient? client, ServerEvents? events)
        {
            Client = client;
            Events = events;
        }

        public Task<T> GetAsync<T>(
            string path,
            IReadOnlyDictionary<string, string?>? query = null,
            TimeSpan? timeout = null,
            CancellationToken ct = default) =>
            RequireClient().GetAsync<T>(path, query, timeout, ct);

        /// <summary>A <c>{"results": [...]}</c> list (deviation 6), unwrapped.</summary>
        public async Task<IReadOnlyList<T>> GetListAsync<T>(
            string path,
            IReadOnlyDictionary<string, string?>? query = null,
            TimeSpan? timeout = null,
            CancellationToken ct = default)
            where T : notnull
        {
            var response = await GetAsync<ListResponse<T>>(path, query, timeout, ct).ConfigureAwait(false);
            return response.Results;
        }

        /// <summary>
        /// A call that changes server state: <paramref name="changes"/> are
        /// recorded in <see cref="Events"/> after it succeeds, never for a
        /// call that failed.
        /// </summary>
        public async Task<T> MutateAsync<T>(
            HttpMethod method,
            string path,
            object? body = null,
            TimeSpan? timeout = null,
            ServerChange changes = ServerChange.None,
            CancellationToken ct = default)
        {
            var client = RequireClient();
            var response = await client.SendAsync<T>(method, path, null, body, timeout, ct).ConfigureAwait(false);
            if (changes != ServerChange.None)
            {
                Events?.Record(changes);
            }
            return response;
        }

        /// <summary>
        /// <see cref="MutateAsync{T}"/> with a raw body in its own content
        /// type (a photo) instead of JSON.
        /// </summary>
        public async Task<T> MutateBytesAsync<T>(
            HttpMethod method,
            string path,
            byte[] body,
            string contentType,
            TimeSpan? timeout = null,
            ServerChange changes = ServerChange.None,
            CancellationToken ct = default)
        {
            var client = RequireClient();
            var response = await client.SendBytesAsync<T>(method, path, body, contentType, timeout, ct).ConfigureAwait(false);
            if (changes != ServerChange.None)
            {
                Events?.Record(changes);
            }
            return response;
        }

        /// <summary>A POST that reads (<c>/surprise</c>) or that the session owns (login): nothing to record.</summary>
        public Task<T> PostAsync<T>(
            string path,
            object? body = null,
            TimeSpan? timeout = null,
            CancellationToken ct = default) =>
            RequireClient().PostAsync<T>(path, body, timeout, ct);

        private ApiClient RequireClient() => Client ?? throw ApiException.Unauthorized();
    }

    // MARK: Paths

    /// <summary>One percent-encoded path segment (an id or type can't add a <c>/</c>).</summary>
    public static string Segment(string value) => Uri.EscapeDataString(value);

    /// <summary>
    /// Lowercase hex with dashes: the server compares some ids as strings
    /// (editing your own account), and that is how it prints them.
    /// </summary>
    public static string Segment(Guid id) => id.ToString("D");

    /// <summary>The wire value of an open enum (a media type, an entity type, a provider) as a segment.</summary>
    public static string Segment<T>(T value) where T : struct, IOpenEnum<T> => Segment(value.Value);
}
