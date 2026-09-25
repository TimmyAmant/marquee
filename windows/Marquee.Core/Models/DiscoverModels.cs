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

    public int Id => TmdbId;
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

    /// <summary>"See all" opens the Movies grid.</summary>
    public required IReadOnlyList<TitleCard> PopularMovies { get; init; }

    public required IReadOnlyList<GenreTile> MovieGenres { get; init; }
    public required IReadOnlyList<TitleCard> UpcomingMovies { get; init; }
    public required IReadOnlyList<CompanyCard> Studios { get; init; }

    /// <summary>"See all" opens the Series grid.</summary>
    public required IReadOnlyList<TitleCard> PopularSeries { get; init; }

    public required IReadOnlyList<GenreTile> SeriesGenres { get; init; }
    public required IReadOnlyList<TitleCard> UpcomingSeries { get; init; }
    public required IReadOnlyList<NetworkCard> Networks { get; init; }
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
}

/// <summary><c>GET /search?q=</c>: the search results page. All four empty: "No results for "…"."</summary>
public sealed record SearchResults
{
    public required string Query { get; init; }
    public required IReadOnlyList<PersonCard> People { get; init; }
    public required IReadOnlyList<CompanyCard> Studios { get; init; }

    /// <summary>With status, favorited and canQuickAdd.</summary>
    public required IReadOnlyList<TitleCard> Titles { get; init; }

    public SearchTheme? Theme { get; init; }

    public bool IsEmpty => People.Count == 0 && Studios.Count == 0 && Titles.Count == 0 && (Theme?.Items.Count ?? 0) == 0;
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

    /// <summary><c>"movie-603"</c>, unique across kinds.</summary>
    public string StableId => $"{MediaType.Value}-{Id}";

    /// <summary>The title to open, null for a person.</summary>
    public TitleId? TitleId => this.MediaType.MediaType is { } type ? new Models.TitleId(type, Id) : null;
}
