using Marquee.Core.Localization;
using System.Globalization;

namespace Marquee.Core.Models;

// Discover, the Movies/Series grids, Surprise me, and search (api-v1.md
// section 2), plus the card shapes every list shares (the doc's "Shared
// shapes"). Mirrors mac/Marquee/API/Models/DiscoverModels.swift.

/// <summary>
/// A poster card. Fields a list doesn't compute on the website are null
/// (<see cref="Favorited"/>, <see cref="Requested"/>) or false
/// (<see cref="CanQuickAdd"/>, <see cref="CanRequest"/>); each endpoint
/// documents which it fills in.
/// </summary>
public sealed record TitleCard
{
    public required MediaType MediaType { get; init; }
    public required int TmdbId { get; init; }
    public required string Name { get; init; }
    public ImageRef? PosterPath { get; init; }

    /// <summary><c>"1999"</c>.</summary>
    public string? Year { get; init; }

    /// <summary>A role/character (filmography), a genre name (Movies/Series grid), else null.</summary>
    public string? Subtitle { get; init; }

    /// <summary>Movies/Series grid only.</summary>
    public string? Overview { get; init; }

    /// <summary>TMDb vote average, 0 to 10. Movies/Series grid only.</summary>
    public double? Rating { get; init; }

    /// <summary>
    /// Null = not in the library at all (no badge). Redraw a card with what
    /// this PC just changed through a <c>with</c> expression (the Mac's
    /// <c>TitleStateStore</c> does the same with a <c>var</c>).
    /// </summary>
    public LibraryStatus? Status { get; init; }

    /// <summary>Null where the website shows no favorite star on that list.</summary>
    public bool? Favorited { get; init; }

    /// <summary>You already have a pending or approved request (franchise/similar rows); null elsewhere.</summary>
    public bool? Requested { get; init; }

    /// <summary>Show "+ Add" (<c>POST /titles/{type}/{id}/add</c>).</summary>
    public required bool CanQuickAdd { get; init; }

    /// <summary>Show "Request", or "Requested" when <see cref="Requested"/> is true.</summary>
    public required bool CanRequest { get; init; }

    public TitleId Id => new(MediaType, TmdbId);

    /// <summary>Subtitle and year joined the way the card footer shows them: "Neo · 1999".</summary>
    public string FooterLine => string.Join(" · ", new[] { Subtitle.NonBlank(), Year.NonBlank() }.OfType<string>());
}

public sealed record PersonCard
{
    public required int TmdbId { get; init; }
    public required string Name { get; init; }
    public ImageRef? ProfilePath { get; init; }
    public string? KnownForDepartment { get; init; }

    /// <summary>Null where the website shows no star.</summary>
    public bool? Favorited { get; init; }

    /// <summary>Search only (0.55+): up to three titles they're known for.</summary>
    public IReadOnlyList<string>? KnownFor { get; init; }

    public int Id => TmdbId;

    /// <summary>"Acting · The Matrix, John Wick": search's line under the photo.</summary>
    public string? KnownForLine
    {
        get
        {
            var department = string.IsNullOrWhiteSpace(KnownForDepartment) ? null : KnownForDepartment;
            var titles = string.Join(", ", (KnownFor ?? []).Where(title => !string.IsNullOrWhiteSpace(title)));
            if (department != null && titles.Length > 0) return $"{department} · {titles}";
            return department ?? (titles.Length > 0 ? titles : null);
        }
    }
}

/// <summary>A studio (production company).</summary>
public sealed record CompanyCard
{
    public required int TmdbId { get; init; }
    public required string Name { get; init; }
    public ImageRef? LogoPath { get; init; }

    /// <summary>Null on Discover's Studios shelf (no star there).</summary>
    public bool? Favorited { get; init; }

    public int Id => TmdbId;
}

/// <summary>A TV network: its logo links to <c>/series?network=</c>.</summary>
public sealed record NetworkCard
{
    public required int TmdbId { get; init; }
    public required string Name { get; init; }
    public ImageRef? LogoPath { get; init; }

    public int Id => TmdbId;
}

public sealed record Genre
{
    public required int Id { get; init; }
    public required string Name { get; init; }
}

/// <summary>A Discover genre tile: links to <c>/movies?genre=</c> or <c>/series?genre=</c>.</summary>
public sealed record GenreTile
{
    public required int Id { get; init; }
    public required string Name { get; init; }
    public ImageRef? BackdropPath { get; init; }
}

/// <summary>
/// <c>GET /discover</c>: shelves in page order. Cards carry <c>status</c>
/// only. Empty shelves are empty arrays; the website hides them.
/// </summary>
public sealed record DiscoverShelves
{
    /// <summary>From Plex/Jellyfin, newest first, max 20.</summary>
    public required IReadOnlyList<TitleCard> RecentlyAdded { get; init; }

    public required IReadOnlyList<TitleCard> Trending { get; init; }

    public required IReadOnlyList<TitleCard> PopularMovies { get; init; }

    public required IReadOnlyList<GenreTile> MovieGenres { get; init; }
    public required IReadOnlyList<TitleCard> UpcomingMovies { get; init; }
    public required IReadOnlyList<CompanyCard> Studios { get; init; }
    public required IReadOnlyList<TitleCard> PopularSeries { get; init; }
    public required IReadOnlyList<GenreTile> SeriesGenres { get; init; }
    public required IReadOnlyList<TitleCard> UpcomingSeries { get; init; }
    public required IReadOnlyList<NetworkCard> Networks { get; init; }

    /// <summary>
    /// Where each shelf's "See all" goes, keyed like the shelves
    /// (<see cref="DiscoverShelfKey"/>). 0.42.4+; an older server leaves it
    /// out. Read it through <see cref="DiscoverSeeAll.Resolve"/>, which
    /// supplies the older server's fallback.
    /// </summary>
    public IReadOnlyDictionary<string, DiscoverSeeAllLink?>? SeeAll { get; init; }

    /// <summary>
    /// The rows to show in the admin's order, their own rows included
    /// (0.49+); null from an older server, which then shows the fixed keys
    /// above. Read through <see cref="DiscoverRows.Resolve"/>.
    /// </summary>
    public IReadOnlyList<DiscoverShelf>? Shelves { get; init; }
}

/// <summary>The wire keys of <c>GET /discover</c>'s shelves, as <see cref="DiscoverShelves.SeeAll"/> uses them.</summary>
public static class DiscoverShelfKey
{
    public const string RecentlyAdded = "recentlyAdded";
    public const string Trending = "trending";
    public const string PopularMovies = "popularMovies";
    public const string MovieGenres = "movieGenres";
    public const string UpcomingMovies = "upcomingMovies";
    public const string Studios = "studios";
    public const string PopularSeries = "popularSeries";
    public const string SeriesGenres = "seriesGenres";
    public const string UpcomingSeries = "upcomingSeries";
    public const string Networks = "networks";
}

/// <summary><c>seeAll</c>'s <c>type</c>: a Discover list page, or the unfiltered Movies/Series grid.</summary>
public readonly record struct SeeAllKind(string Value) : IOpenEnum<SeeAllKind>
{
    public static readonly SeeAllKind List = new("list");
    public static readonly SeeAllKind Browse = new("browse");

    public static IReadOnlyList<SeeAllKind> Known { get; } = [List, Browse];
    public static SeeAllKind FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;
}

/// <summary>
/// A Discover shelf's full list: <c>GET /discover/lists/{list}</c> (the
/// website's <c>/discover/{list}</c>). Besides the named lists, any custom
/// row's id (0.49+), which is why this stays open.
/// </summary>
public readonly record struct DiscoverListKind(string Value) : IOpenEnum<DiscoverListKind>
{
    public static readonly DiscoverListKind Trending = new("trending");
    public static readonly DiscoverListKind RecentlyAdded = new("recently-added");
    public static readonly DiscoverListKind UpcomingMovies = new("upcoming-movies");
    public static readonly DiscoverListKind UpcomingSeries = new("upcoming-series");

    /// <summary>0.53+: "Your Watchlist", the viewer's own Plex Watchlist.</summary>
    public static readonly DiscoverListKind Watchlist = new("watchlist");

    public static IReadOnlyList<DiscoverListKind> Known { get; } = [Trending, RecentlyAdded, UpcomingMovies, UpcomingSeries, Watchlist];
    public static DiscoverListKind FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    /// <summary>The heading until the server's own <see cref="DiscoverListResults.Title"/> arrives.</summary>
    public string Title =>
        this == Trending ? Loc.Get("Model_DiscoverTrending")
        : this == RecentlyAdded ? Loc.Get("Model_DiscoverRecentlyAdded")
        : this == UpcomingMovies ? Loc.Get("Model_DiscoverUpcomingMovies")
        : this == UpcomingSeries ? Loc.Get("Model_DiscoverUpcomingSeries")
        : this == Watchlist ? Loc.Get("Model_DiscoverWatchlist")
        : IsCustomRow ? Loc.Get("Model_DiscoverCustomRow")
        : OpenEnum.Capitalized(Value.Replace('-', ' '));

    /// <summary>A custom row's uuid rather than a named list (0.49+): no name of its own until the server's title arrives.</summary>
    public bool IsCustomRow => Guid.TryParse(Value, out _);

    /// <summary>Trending and Recently Added mix movies and series, so their cards carry the MOVIE/SERIES pill.</summary>
    public bool MixesMediaTypes => this != UpcomingMovies && this != UpcomingSeries;
}

/// <summary>One <c>seeAll</c> entry: <c>{"type", "list", "mediaType"}</c>.</summary>
public sealed record DiscoverSeeAllLink
{
    public required SeeAllKind Type { get; init; }

    /// <summary>For <see cref="SeeAllKind.List"/>; null otherwise.</summary>
    public DiscoverListKind? List { get; init; }

    /// <summary>For <see cref="SeeAllKind.Browse"/>: the Movies (<c>movie</c>) or Series (<c>tv</c>) grid; null otherwise.</summary>
    public MediaType? MediaType { get; init; }
}

/// <summary>Where a shelf's "See all" chevron goes, once resolved.</summary>
public abstract record SeeAllTarget
{
    private SeeAllTarget()
    {
    }

    /// <summary>
    /// The shelf's own paged list (<c>GET /discover/lists/{list}</c>): a
    /// built-in list, or (0.49+) a custom row's id. <paramref name="Title"/>
    /// is the row's name, the heading until the list's own title arrives.
    /// </summary>
    public sealed record DiscoverList(DiscoverListKind Kind, string? Title = null) : SeeAllTarget;

    /// <summary>The unfiltered Movies or Series grid.</summary>
    public sealed record BrowseGrid(MediaType MediaType) : SeeAllTarget;
}

public static class DiscoverSeeAll
{
    /// <summary>
    /// Where <paramref name="shelfKey"/>'s "See all" goes, or null for none.
    /// With a <c>seeAll</c> map it is the map's word, and an unknown type,
    /// list or media type means none; an older server without one gets the
    /// links it always had: Popular Movies/Series and the genre shelves open
    /// the Movies/Series grid, nothing else has one.
    /// </summary>
    public static SeeAllTarget? Resolve(DiscoverShelves shelves, string shelfKey)
    {
        if (shelves.SeeAll is not { } map)
        {
            return shelfKey switch
            {
                DiscoverShelfKey.PopularMovies or DiscoverShelfKey.MovieGenres => new SeeAllTarget.BrowseGrid(MediaType.Movie),
                DiscoverShelfKey.PopularSeries or DiscoverShelfKey.SeriesGenres => new SeeAllTarget.BrowseGrid(MediaType.Tv),
                _ => null,
            };
        }
        if (!map.TryGetValue(shelfKey, out var link) || link == null)
        {
            return null;
        }
        if (link.Type == SeeAllKind.List)
        {
            return link.List is { IsKnown: true } list ? new SeeAllTarget.DiscoverList(list) : null;
        }
        if (link.Type == SeeAllKind.Browse)
        {
            return link.MediaType is { IsKnown: true } mediaType ? new SeeAllTarget.BrowseGrid(mediaType) : null;
        }
        return null;
    }
}

/// <summary>
/// <c>GET /discover/lists/{list}?page=</c>: one page of a shelf's full
/// list, <see cref="Paginated{T}"/>'s fields plus the list and its title.
/// Continue while <see cref="HasMorePages"/>, skipping titles already shown.
/// </summary>
public sealed record DiscoverListResults
{
    public required DiscoverListKind List { get; init; }

    /// <summary>"Trending": the page heading.</summary>
    public required string Title { get; init; }

    public required int Page { get; init; }
    public required int TotalPages { get; init; }
    public required int TotalResults { get; init; }

    /// <summary>With status, favorited and canQuickAdd.</summary>
    public required IReadOnlyList<TitleCard> Results { get; init; }

    public bool HasMorePages => Page < TotalPages;
}

/// <summary>
/// The Movies/Series grid's filters (<c>GET /movies</c>, <c>/series</c>).
/// Page through with <see cref="QueryItems"/>'s page argument;
/// <see cref="ExtrasQueryItems"/> drives the matching <c>/extras</c> call.
/// The page itself is a <see cref="Paginated{T}"/> of <see cref="TitleCard"/>
/// (the Mac's <c>BrowsePage</c>): a batch of several TMDb pages,
/// de-duplicated, so page sizes vary, and titles can reappear on later
/// pages, so skip ones already shown.
/// </summary>
public sealed record BrowseQuery
{
    /// <summary>The website's defaults: popular, hiding what the library already has.</summary>
    public static BrowseQuery Default { get; } = new();

    public BrowseSort Sort { get; init; } = BrowseSort.Popularity;

    /// <summary>TMDb genre id, from <see cref="BrowseExtras.Genres"/>.</summary>
    public int? GenreId { get; init; }

    /// <summary>1800 to 3000.</summary>
    public int? Year { get; init; }

    /// <summary>Series only; the server ignores it for movies.</summary>
    public int? NetworkId { get; init; }

    /// <summary>Hide anything already in the library (the website's default when signed in).</summary>
    public bool HideOwned { get; init; } = true;

    /// <summary>The grid's query; a null value leaves its key out on the wire.</summary>
    public IReadOnlyDictionary<string, string?> QueryItems(int page) => new Dictionary<string, string?>
    {
        ["sort"] = Sort.Value,
        ["genre"] = GenreId?.ToString(CultureInfo.InvariantCulture),
        ["year"] = Year?.ToString(CultureInfo.InvariantCulture),
        ["network"] = NetworkId?.ToString(CultureInfo.InvariantCulture),
        ["hideOwned"] = HideOwned ? "true" : "false",
        ["page"] = page.ToString(CultureInfo.InvariantCulture),
    };

    /// <summary>The <c>/extras</c> query: the filters only, since sort and page don't change the extras.</summary>
    public IReadOnlyDictionary<string, string?> ExtrasQueryItems => new Dictionary<string, string?>
    {
        ["genre"] = GenreId?.ToString(CultureInfo.InvariantCulture),
        ["year"] = Year?.ToString(CultureInfo.InvariantCulture),
        ["network"] = NetworkId?.ToString(CultureInfo.InvariantCulture),
    };
}

/// <summary>The "Because you watched {title}" row of a grid page.</summary>
public sealed record BecauseYouWatched
{
    /// <summary>"Because you watched {title}".</summary>
    public required string Title { get; init; }

    /// <summary>At most 12, with status, favorited and canQuickAdd.</summary>
    public required IReadOnlyList<TitleCard> Items { get; init; }
}

/// <summary><c>GET /movies/extras</c> / <c>/series/extras</c>: everything on the page besides the grid.</summary>
public sealed record BrowseExtras
{
    /// <summary>The genre filter's options.</summary>
    public required IReadOnlyList<Genre> Genres { get; init; }

    /// <summary>The active network chip; null without <c>?network=</c>.</summary>
    public NetworkCard? Network { get; init; }

    /// <summary>Null with a genre/year filter or no Plex watch history of this media type.</summary>
    public BecauseYouWatched? BecauseYouWatched { get; init; }
}

/// <summary><c>POST /surprise</c>'s <c>type</c>: a movie, a series, or either (random per call).</summary>
public readonly record struct SurpriseKind(string Value) : IOpenEnum<SurpriseKind>
{
    public static readonly SurpriseKind Movie = new("movie");
    public static readonly SurpriseKind Tv = new("tv");
    public static readonly SurpriseKind All = new("all");

    public static IReadOnlyList<SurpriseKind> Known { get; } = [Movie, Tv, All];
    public static SurpriseKind FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    /// <summary>The kind for one media type: the wire value is the same string.</summary>
    public static SurpriseKind Of(MediaType mediaType) => new(mediaType.Value);
}

/// <summary>
/// <c>POST /surprise</c> body. Null fields are left out and use the server's
/// defaults (<c>type: "all"</c>, <c>hideOwned: true</c>).
/// </summary>
public sealed record SurpriseRequest(SurpriseKind? Type = null, int? GenreId = null, int? Year = null, bool? HideOwned = null);

/// <summary>A genre or keyword the search query named: "{label} movies &amp; TV".</summary>
public sealed record SearchTheme
{
    public required string Label { get; init; }
    public required IReadOnlyList<TitleCard> Items { get; init; }

    /// <summary>
    /// 0.55+: "first" when the query is that genre/keyword itself ("horror"),
    /// so its row leads the page; "last", or null from an older server, puts
    /// it after the other sections.
    /// </summary>
    public string? Placement { get; init; }

    public bool LeadsPage => Placement == "first";
}

/// <summary><c>GET /search?q=</c>: the search results page. All empty: "No results for "…"."</summary>
public sealed record SearchResults
{
    public required string Query { get; init; }
    public required IReadOnlyList<PersonCard> People { get; init; }
    public required IReadOnlyList<CompanyCard> Studios { get; init; }

    /// <summary>With status, favorited and canQuickAdd.</summary>
    public required IReadOnlyList<TitleCard> Titles { get; init; }

    public SearchTheme? Theme { get; init; }

    /// <summary>
    /// 0.55+: the page in the order to show it (movies, series, people,
    /// studios &amp; networks); null from an older server, where
    /// <see cref="SearchPageLayout"/> falls back to the fields above.
    /// </summary>
    public SearchSections? Sections { get; init; }

    public bool IsEmpty =>
        People.Count == 0 && Studios.Count == 0 && Titles.Count == 0 && (Theme?.Items.Count ?? 0) == 0
        && (Sections is null || (Sections.Movies.Results.Count == 0 && Sections.Series.Results.Count == 0
            && Sections.People.Results.Count == 0 && Sections.StudiosAndNetworks.Results.Count == 0));
}

/// <summary>One section of the search page (0.55+): TMDb's first page, best match first, and how many in all.</summary>
public sealed record SearchSection<T> where T : notnull
{
    public required int TotalResults { get; init; }
    public required int TotalPages { get; init; }
    public required IReadOnlyList<T> Results { get; init; }

    /// <summary>More than the section shows: offer See all.</summary>
    public bool HasMore => TotalResults > Results.Count;
}

/// <summary><c>SearchResults.sections</c> (0.55+).</summary>
public sealed record SearchSections
{
    public required SearchSection<TitleCard> Movies { get; init; }
    public required SearchSection<TitleCard> Series { get; init; }
    public required SearchSection<PersonCard> People { get; init; }
    public required SearchSection<SearchCompanyCard> StudiosAndNetworks { get; init; }
}

/// <summary>
/// A studio or network in search's Studios &amp; Networks (0.55+): a studio
/// opens its company page, a network the Series grid filtered to it.
/// </summary>
public sealed record SearchCompanyCard
{
    /// <summary>"studio" or "network"; anything else reads as a studio.</summary>
    public required string Kind { get; init; }

    public required int TmdbId { get; init; }
    public required string Name { get; init; }
    public ImageRef? LogoPath { get; init; }

    /// <summary>Always null for a network (no star).</summary>
    public bool? Favorited { get; init; }

    public bool IsNetwork => Kind == "network";

    /// <summary><c>"network-49"</c>: studios and networks share TMDb ids.</summary>
    public string StableId => $"{Kind}-{TmdbId}";

    /// <summary>An older server's studio.</summary>
    public static SearchCompanyCard FromStudio(CompanyCard studio) => new()
    {
        Kind = "studio",
        TmdbId = studio.TmdbId,
        Name = studio.Name,
        LogoPath = studio.LogoPath,
        Favorited = studio.Favorited,
    };
}

/// <summary><c>GET /search/{section}</c> (0.55+): which section's See all.</summary>
public enum SearchSectionName
{
    Movies,
    Series,
    People,
    Studios,
}

/// <summary>
/// app/search/page.tsx's order from a <c>GET /search</c> answer: always
/// Movies, TV Shows, People, then Studios &amp; Networks, empty ones left out;
/// a genre/keyword theme leads when the query is that theme ("horror"), else
/// comes last. An older server (no <c>sections</c>) has its titles split into
/// movies and series and its studios stand in, with no See all. Pure.
/// </summary>
public static class SearchPageLayout
{
    public enum BlockKind
    {
        Theme,
        Movies,
        Series,
        People,
        Studios,
    }

    /// <summary>The blocks, top to bottom.</summary>
    public static IReadOnlyList<BlockKind> Blocks(SearchResults results)
    {
        var sections = SectionsOf(results);
        var theme = results.Theme is { Items.Count: > 0 } ? results.Theme : null;
        var blocks = new List<BlockKind>();
        if (theme is { LeadsPage: true })
        {
            blocks.Add(BlockKind.Theme);
        }
        if (sections.Movies.Results.Count > 0)
        {
            blocks.Add(BlockKind.Movies);
        }
        if (sections.Series.Results.Count > 0)
        {
            blocks.Add(BlockKind.Series);
        }
        if (sections.People.Results.Count > 0)
        {
            blocks.Add(BlockKind.People);
        }
        if (sections.StudiosAndNetworks.Results.Count > 0)
        {
            blocks.Add(BlockKind.Studios);
        }
        if (theme is { LeadsPage: false })
        {
            blocks.Add(BlockKind.Theme);
        }
        return blocks;
    }

    /// <summary>The server's sections, or an older server's flat answer as sections (no See all).</summary>
    public static SearchSections SectionsOf(SearchResults results) => results.Sections ?? new SearchSections
    {
        Movies = Whole(results.Titles.Where(card => card.MediaType == MediaType.Movie).ToList()),
        Series = Whole(results.Titles.Where(card => card.MediaType == MediaType.Tv).ToList()),
        People = Whole(results.People),
        StudiosAndNetworks = Whole(results.Studios.Select(SearchCompanyCard.FromStudio).ToList()),
    };

    private static SearchSection<T> Whole<T>(IReadOnlyList<T> items) where T : notnull =>
        new() { TotalResults = items.Count, TotalPages = 1, Results = items };
}

/// <summary><c>GET /search/suggest?q=</c>: header type-ahead, at most 7 people/movies/series.</summary>
public sealed record SearchSuggestion
{
    /// <summary>A TMDb id: person ids and title ids overlap, so key lists by <see cref="StableId"/>.</summary>
    public required int Id { get; init; }

    public required SuggestionKind MediaType { get; init; }
    public required string Name { get; init; }

    /// <summary>A poster for titles, a profile photo for people.</summary>
    public ImageRef? PosterPath { get; init; }

    /// <summary>The year for titles, the known-for department for people.</summary>
    public string? Subtitle { get; init; }

    /// <summary>
    /// The viewer's library status for a movie/series; null for a person, and
    /// from a server that predates the field.
    /// </summary>
    public LibraryStatus? Status { get; init; }

    /// <summary>
    /// What the kind pill's status means in words ("In your library",
    /// "Downloading", …); null with no status or one this app doesn't know,
    /// where the pill stays neutral.
    /// </summary>
    public string? StatusLabel
    {
        get
        {
            if (Status is not { IsKnown: true } status) return null;
            return status.Name;
        }
    }

    /// <summary>"Movie · In your library", or just "Movie" without a known status.</summary>
    public string KindAccessibleLabel => StatusLabel is { } label ? $"{MediaType.Label} · {label}" : MediaType.Label;

    /// <summary><c>"movie-603"</c>, unique across kinds.</summary>
    public string StableId => $"{MediaType.Value}-{Id}";

    /// <summary>The title to open, null for a person.</summary>
    public TitleId? TitleId => this.MediaType.MediaType is { } type ? new Models.TitleId(type, Id) : null;
}
