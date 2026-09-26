using System.Globalization;
using Marquee.Core.Models;

namespace Marquee.Core.Api;

// Discover, the Movies/Series grids and search (api-v1.md section 2). All
// need TMDb: without it they throw Upstream with TmdbErrors.UnconfiguredMessage
// (deviation 7), which every TMDb-backed screen turns into its "Connect TMDb"
// empty state instead of a raw error.

public sealed partial class MarqueeApi
{
    public DiscoverEndpoints Discover => new(transport);
    public BrowseEndpoints Browse => new(transport);
    public SearchEndpoints Search => new(transport);
}

public sealed class DiscoverEndpoints(MarqueeApi.Transport transport)
{
    /// <summary><c>GET /discover</c>: the landing page's shelves.</summary>
    public Task<DiscoverShelves> ShelvesAsync(CancellationToken ct = default) =>
        transport.GetAsync<DiscoverShelves>("/discover", timeout: MarqueeApi.Timeouts.Tmdb, ct: ct);

    /// <summary>
    /// <c>GET /discover/lists/{list}?page=</c>: one page of a shelf's full
    /// list (0.42.4+). Continue while <see cref="DiscoverListResults.HasMorePages"/>.
    /// An unknown list is NotFound.
    /// </summary>
    public Task<DiscoverListResults> ListPageAsync(DiscoverListKind list, int page = 1, CancellationToken ct = default) =>
        transport.GetAsync<DiscoverListResults>(
            $"/discover/lists/{MarqueeApi.Segment(list)}",
            new Dictionary<string, string?> { ["page"] = page.ToString(CultureInfo.InvariantCulture) },
            MarqueeApi.Timeouts.Tmdb,
            ct);

    /// <summary>
    /// <c>POST /surprise</c>: "🎲 Surprise me". A read that happens to be a
    /// POST, so nothing is recorded. NotFound when nothing matches the
    /// filters; the server's message says to loosen them.
    /// </summary>
    public Task<TitleId> SurpriseAsync(SurpriseRequest? request = null, CancellationToken ct = default) =>
        transport.PostAsync<TitleId>("/surprise", request ?? new SurpriseRequest(), timeout: MarqueeApi.Timeouts.Tmdb, ct: ct);
}

public sealed class BrowseEndpoints(MarqueeApi.Transport transport)
{
    /// <summary><c>GET /movies</c> or <c>/series</c>: one grid page. Continue while <see cref="Paginated{T}.HasMorePages"/>.</summary>
    public async Task<Paginated<TitleCard>> PageAsync(MediaType type, BrowseQuery? query = null, int page = 1, CancellationToken ct = default)
    {
        var path = Path(type);
        var items = (query ?? BrowseQuery.Default).QueryItems(page);
        return await transport.GetAsync<Paginated<TitleCard>>(path, items, MarqueeApi.Timeouts.Tmdb, ct).ConfigureAwait(false);
    }

    /// <summary><c>GET /movies/extras</c> or <c>/series/extras</c>: genres, the network chip, "Because you watched".</summary>
    public async Task<BrowseExtras> ExtrasAsync(MediaType type, BrowseQuery? query = null, CancellationToken ct = default)
    {
        var path = Path(type) + "/extras";
        var items = (query ?? BrowseQuery.Default).ExtrasQueryItems;
        return await transport.GetAsync<BrowseExtras>(path, items, MarqueeApi.Timeouts.Tmdb, ct).ConfigureAwait(false);
    }

    /// <summary>
    /// The grids are per media type, not per <c>/titles/{type}</c> segment,
    /// so a media type this app doesn't know has no page to ask for: the
    /// same NotFound the server would answer, without a request.
    /// </summary>
    private static string Path(MediaType type)
    {
        if (type == MediaType.Movie)
        {
            return "/movies";
        }
        if (type == MediaType.Tv)
        {
            return "/series";
        }
        throw ApiException.NotFound();
    }
}

public sealed class SearchEndpoints(MarqueeApi.Transport transport)
{
    /// <summary><c>GET /search?q=</c>: the results page. A blank query is Invalid.</summary>
    public Task<SearchResults> ResultsAsync(string query, CancellationToken ct = default) =>
        transport.GetAsync<SearchResults>("/search", new Dictionary<string, string?> { ["q"] = query }, MarqueeApi.Timeouts.Tmdb, ct);

    /// <summary><c>GET /search/suggest?q=</c>: type-ahead; under 2 characters is always empty.</summary>
    public Task<IReadOnlyList<SearchSuggestion>> SuggestionsAsync(string query, CancellationToken ct = default) =>
        transport.GetListAsync<SearchSuggestion>("/search/suggest", new Dictionary<string, string?> { ["q"] = query }, ct: ct);
}

/// <summary>
/// The one Upstream error a TMDb-backed screen handles itself: TMDb isn't
/// set up on the server, so show "Connect TMDb to start browsing" rather
/// than the error text (the Mac's <c>APIError.isTMDbUnconfigured</c>).
/// </summary>
public static class TmdbErrors
{
    /// <summary>The server's exact message when no TMDb credential is configured (api-v1.md deviation 7).</summary>
    public const string UnconfiguredMessage =
        "TMDb isn't configured on this server. An admin needs to add a TMDb access token in Settings → Integrations.";

    public static bool IsTmdbUnconfigured(this ApiException error) =>
        error.Kind == ApiErrorKind.Upstream && error.ServerMessage == UnconfiguredMessage;
}
