using System.Globalization;
using Marquee.Core.Localization;

namespace Marquee.Core.Models;

// Customisable Discover rows (api-v1.md deviation 18, 0.49+): GET /discover's
// `shelves` (the rows in the admin's order, their own rows included), and
// Settings › Discover, where the admin reorders, hides, adds, renames and
// removes them (/settings/discover). An older server sends no `shelves` and
// answers 404 on /settings/discover: the fixed keys render as before and the
// Settings tab stays hidden.

/// <summary>
/// A Discover row's <c>kind</c>: a built-in row's key (<c>trending</c>,
/// <c>movieGenres</c>, …) or what an admin's own row is built from. Open, so
/// a kind a newer server adds still decodes; Discover then shows its
/// <c>results</c> as a poster row, or skips it.
/// </summary>
public readonly record struct DiscoverRowKind(string Value) : IOpenEnum<DiscoverRowKind>
{
    public static readonly DiscoverRowKind Keyword = new("keyword");
    public static readonly DiscoverRowKind Genre = new("genre");
    public static readonly DiscoverRowKind Company = new("company");
    public static readonly DiscoverRowKind Network = new("network");
    public static readonly DiscoverRowKind TmdbList = new("tmdbList");
    public static readonly DiscoverRowKind TraktList = new("traktList");
    public static readonly DiscoverRowKind Library = new("library");

    /// <summary>What an admin can build a row from, in the Add row picker's order.</summary>
    public static IReadOnlyList<DiscoverRowKind> CustomKinds { get; } = [Keyword, Genre, Company, Network, TmdbList, TraktList, Library];

    /// <summary>The built-in rows, whose kind is their key (<see cref="DiscoverShelfKey"/>).</summary>
    public static IReadOnlyList<DiscoverRowKind> BuiltInKinds { get; } =
    [
        new(DiscoverShelfKey.RecentlyAdded), new(DiscoverShelfKey.Trending), new(DiscoverShelfKey.PopularMovies),
        new(DiscoverShelfKey.MovieGenres), new(DiscoverShelfKey.UpcomingMovies), new(DiscoverShelfKey.Studios),
        new(DiscoverShelfKey.PopularSeries), new(DiscoverShelfKey.SeriesGenres), new(DiscoverShelfKey.UpcomingSeries),
        new(DiscoverShelfKey.Networks),
    ];

    public static IReadOnlyList<DiscoverRowKind> Known { get; } = [.. BuiltInKinds, .. CustomKinds];
    public static DiscoverRowKind FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public bool IsCustomKind => CustomKinds.Contains(this);
    public override string ToString() => Value;

    /// <summary>The Add row picker's words (the doc's "Website label").</summary>
    public string Label =>
        this == Keyword ? Loc.Get("Rows_KindKeyword")
        : this == Genre ? Loc.Get("Rows_KindGenre")
        : this == Company ? Loc.Get("Rows_KindStudio")
        : this == Network ? Loc.Get("Rows_KindNetwork")
        : this == TmdbList ? Loc.Get("Rows_KindTmdbList")
        : this == TraktList ? Loc.Get("Rows_KindTraktList")
        : this == Library ? Loc.Get("Rows_KindLibrary")
        : OpenEnum.Capitalized(Value);
}

/// <summary>A custom row's movies, series, or both (<c>source.mediaType</c>, and the lookup's <c>mediaType</c>).</summary>
public readonly record struct ShelfMediaType(string Value) : IOpenEnum<ShelfMediaType>
{
    public static readonly ShelfMediaType All = new("all");
    public static readonly ShelfMediaType Movie = new("movie");
    public static readonly ShelfMediaType Tv = new("tv");

    public static IReadOnlyList<ShelfMediaType> Known { get; } = [All, Movie, Tv];
    public static ShelfMediaType FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    /// <summary>"Movies and series", "Movies", "Series".</summary>
    public string Label =>
        this == All ? Loc.Get("Rows_MediaAll")
        : this == Movie ? Loc.Get("Rows_MediaMovies")
        : this == Tv ? Loc.Get("Rows_MediaSeries")
        : OpenEnum.Capitalized(Value);
}

/// <summary>A Studios/Networks tile of a <see cref="DiscoverShelf"/>: <c>{tmdbId, name, logoPath}</c>.</summary>
public sealed record DiscoverLogo
{
    public required int TmdbId { get; init; }
    public required string Name { get; init; }
    public ImageRef? LogoPath { get; init; }
}

/// <summary>
/// One row of <c>GET /discover</c>'s <c>shelves</c> (0.49+). Exactly one of
/// <see cref="Results"/>, <see cref="Genres"/> and <see cref="Logos"/> is
/// non-null. Read through <see cref="DiscoverRows.Resolve"/>.
/// </summary>
public sealed record DiscoverShelf
{
    /// <summary>A built-in row's key, or a custom row's uuid.</summary>
    public required string Id { get; init; }

    public required DiscoverRowKind Kind { get; init; }
    public required string Title { get; init; }
    public bool Custom { get; init; }

    /// <summary>A poster row: every custom row and the built-in poster rows.</summary>
    public IReadOnlyList<TitleCard>? Results { get; init; }

    /// <summary><c>movieGenres</c> / <c>seriesGenres</c>.</summary>
    public IReadOnlyList<GenreTile>? Genres { get; init; }

    /// <summary><c>studios</c> / <c>networks</c>.</summary>
    public IReadOnlyList<DiscoverLogo>? Logos { get; init; }

    /// <summary>A custom row's is always <c>{type: "list", list: its id}</c>.</summary>
    public DiscoverSeeAllLink? SeeAll { get; init; }
}

/// <summary>
/// One Discover row ready to draw: posters, genre tiles or logo tiles, with
/// where its "See all" goes (null: none). What <see cref="DiscoverRows.Resolve"/>
/// makes of <c>GET /discover</c>.
/// </summary>
/// <param name="Id">The row's key or uuid.</param>
/// <param name="Title">The row's heading.</param>
/// <param name="SeeAll">Where the row's "See all" goes; null for none.</param>
public abstract record DiscoverRow(string Id, string Title, SeeAllTarget? SeeAll)
{
    /// <summary>Title cards (with library status).</summary>
    public sealed record Posters(string Id, string Title, SeeAllTarget? SeeAll, IReadOnlyList<TitleCard> Cards)
        : DiscoverRow(Id, Title, SeeAll);

    /// <summary>Genre tiles: each opens the Movies (<see cref="MediaType.Movie"/>) or Series grid with that genre.</summary>
    public sealed record Genres(string Id, string Title, SeeAllTarget? SeeAll, MediaType MediaType, IReadOnlyList<GenreTile> Tiles)
        : DiscoverRow(Id, Title, SeeAll);

    /// <summary>Studio logos: each opens the company's page.</summary>
    public sealed record Studios(string Id, string Title, SeeAllTarget? SeeAll, IReadOnlyList<DiscoverLogo> Logos)
        : DiscoverRow(Id, Title, SeeAll);

    /// <summary>Network logos: each opens the Series grid for that network.</summary>
    public sealed record Networks(string Id, string Title, SeeAllTarget? SeeAll, IReadOnlyList<DiscoverLogo> Logos)
        : DiscoverRow(Id, Title, SeeAll);
}

/// <summary>Discover's rows, in the order to draw them. Pure.</summary>
public static class DiscoverRows
{
    /// <summary>Every built-in row's name, as the website has always shown it, in the fixed page order.</summary>
    public static IReadOnlyList<(string Key, string Title)> BuiltIn =>
    [
        (DiscoverShelfKey.RecentlyAdded, Loc.Get("Rows_RecentlyAdded")),
        (DiscoverShelfKey.Trending, Loc.Get("Rows_Trending")),
        (DiscoverShelfKey.PopularMovies, Loc.Get("Rows_PopularMovies")),
        (DiscoverShelfKey.MovieGenres, Loc.Get("Rows_MovieGenres")),
        (DiscoverShelfKey.UpcomingMovies, Loc.Get("Rows_UpcomingMovies")),
        (DiscoverShelfKey.Studios, Loc.Get("Rows_Studios")),
        (DiscoverShelfKey.PopularSeries, Loc.Get("Rows_PopularSeries")),
        (DiscoverShelfKey.SeriesGenres, Loc.Get("Rows_SeriesGenres")),
        (DiscoverShelfKey.UpcomingSeries, Loc.Get("Rows_UpcomingSeries")),
        (DiscoverShelfKey.Networks, Loc.Get("Rows_Networks")),
    ];

    /// <summary>
    /// The rows to show. With <c>shelves</c> (0.49+): in their order; a row
    /// with <c>results</c> is a poster row whatever its kind, genre and logo
    /// rows are drawn for the kinds that have them, and anything else (a kind
    /// this app doesn't know without results) is skipped. Without it (an
    /// older server): the fixed keys in the page order. Empty rows are left
    /// out either way, as the website hides them.
    /// </summary>
    public static IReadOnlyList<DiscoverRow> Resolve(DiscoverShelves response) =>
        response.Shelves is { } shelves ? FromShelves(response, shelves) : FromFixedKeys(response);

    private static List<DiscoverRow> FromShelves(DiscoverShelves response, IReadOnlyList<DiscoverShelf> shelves)
    {
        var rows = new List<DiscoverRow>();
        foreach (var shelf in shelves)
        {
            var seeAll = SeeAllFor(response, shelf);
            if (shelf.Results is { } results)
            {
                if (results.Count > 0)
                {
                    rows.Add(new DiscoverRow.Posters(shelf.Id, shelf.Title, seeAll, results));
                }
                continue;
            }
            if (shelf.Genres is { Count: > 0 } genres)
            {
                if (shelf.Kind.Value == DiscoverShelfKey.MovieGenres)
                {
                    rows.Add(new DiscoverRow.Genres(shelf.Id, shelf.Title, seeAll, MediaType.Movie, genres));
                }
                else if (shelf.Kind.Value == DiscoverShelfKey.SeriesGenres)
                {
                    rows.Add(new DiscoverRow.Genres(shelf.Id, shelf.Title, seeAll, MediaType.Tv, genres));
                }
                continue;
            }
            if (shelf.Logos is { Count: > 0 } logos)
            {
                if (shelf.Kind.Value == DiscoverShelfKey.Studios)
                {
                    rows.Add(new DiscoverRow.Studios(shelf.Id, shelf.Title, seeAll, logos));
                }
                else if (shelf.Kind.Value == DiscoverShelfKey.Networks)
                {
                    rows.Add(new DiscoverRow.Networks(shelf.Id, shelf.Title, seeAll, logos));
                }
            }
        }
        return rows;
    }

    private static List<DiscoverRow> FromFixedKeys(DiscoverShelves response)
    {
        var rows = new List<DiscoverRow>();
        foreach (var (key, title) in BuiltIn)
        {
            var seeAll = DiscoverSeeAll.Resolve(response, key);
            switch (key)
            {
                case DiscoverShelfKey.MovieGenres when response.MovieGenres.Count > 0:
                    rows.Add(new DiscoverRow.Genres(key, title, seeAll, MediaType.Movie, response.MovieGenres));
                    break;
                case DiscoverShelfKey.SeriesGenres when response.SeriesGenres.Count > 0:
                    rows.Add(new DiscoverRow.Genres(key, title, seeAll, MediaType.Tv, response.SeriesGenres));
                    break;
                case DiscoverShelfKey.Studios when response.Studios.Count > 0:
                    rows.Add(new DiscoverRow.Studios(key, title, seeAll, response.Studios.Select(Logo).ToList()));
                    break;
                case DiscoverShelfKey.Networks when response.Networks.Count > 0:
                    rows.Add(new DiscoverRow.Networks(key, title, seeAll, response.Networks.Select(Logo).ToList()));
                    break;
                default:
                    if (FixedPosters(response, key) is { Count: > 0 } cards)
                    {
                        rows.Add(new DiscoverRow.Posters(key, title, seeAll, cards));
                    }
                    break;
            }
        }
        return rows;
    }

    private static IReadOnlyList<TitleCard>? FixedPosters(DiscoverShelves response, string key) => key switch
    {
        DiscoverShelfKey.RecentlyAdded => response.RecentlyAdded,
        DiscoverShelfKey.Trending => response.Trending,
        DiscoverShelfKey.PopularMovies => response.PopularMovies,
        DiscoverShelfKey.UpcomingMovies => response.UpcomingMovies,
        DiscoverShelfKey.PopularSeries => response.PopularSeries,
        DiscoverShelfKey.UpcomingSeries => response.UpcomingSeries,
        _ => null,
    };

    private static DiscoverLogo Logo(CompanyCard studio) => new() { TmdbId = studio.TmdbId, Name = studio.Name, LogoPath = studio.LogoPath };

    private static DiscoverLogo Logo(NetworkCard network) => new() { TmdbId = network.TmdbId, Name = network.Name, LogoPath = network.LogoPath };

    /// <summary>
    /// A shelf's "See all": a <c>list</c> link opens that list whatever it
    /// is named (a built-in list or a custom row's id), titled with the
    /// row's name until the list's own title arrives; a <c>browse</c> link
    /// the Movies/Series grid. Without a link, the fixed keys' map.
    /// </summary>
    public static SeeAllTarget? SeeAllFor(DiscoverShelves response, DiscoverShelf shelf)
    {
        if (shelf.SeeAll is not { } link)
        {
            return DiscoverSeeAll.Resolve(response, shelf.Id);
        }
        if (link.Type == SeeAllKind.List)
        {
            return link.List is { } list && list.Value.Length > 0 ? new SeeAllTarget.DiscoverList(list, shelf.Title) : null;
        }
        if (link.Type == SeeAllKind.Browse)
        {
            return link.MediaType is { IsKnown: true } mediaType ? new SeeAllTarget.BrowseGrid(mediaType) : null;
        }
        return null;
    }
}

// MARK: Settings › Discover

/// <summary>
/// What a custom row is built from, one flat shape for every kind: a TMDb
/// keyword, genre, company, network or list (<see cref="TmdbId"/> and its
/// <see cref="Name"/>), a Trakt list (<see cref="Url"/>), or the library
/// (just <see cref="MediaType"/>).
/// </summary>
public sealed record DiscoverShelfSource
{
    public ShelfMediaType? MediaType { get; init; }
    public int? TmdbId { get; init; }
    public string? Name { get; init; }
    public string? Url { get; init; }
}

/// <summary>A row as Settings › Discover lists it (<c>GET /settings/discover</c>), hidden ones included.</summary>
public sealed record DiscoverShelfSetting
{
    public required string Id { get; init; }
    public required DiscoverRowKind Kind { get; init; }
    public required string Title { get; init; }
    public required bool Custom { get; init; }
    public required bool Hidden { get; init; }

    /// <summary>Null for a built-in row.</summary>
    public DiscoverShelfSource? Source { get; init; }

    /// <summary>
    /// The line under a custom row's name: the kind and what it's built
    /// from, "TMDb keyword · anime · Movies and series", "Trakt list ·
    /// https://trakt.tv/…". "Built-in row" for the others.
    /// </summary>
    public string Subtitle
    {
        get
        {
            if (!Custom)
            {
                return Loc.Get("Rows_BuiltInRow");
            }
            var parts = new List<string> { Kind.Label };
            if (Source is { } source)
            {
                if (Kind == DiscoverRowKind.TraktList)
                {
                    if (source.Url.NonBlank() is { } url)
                    {
                        parts.Add(url);
                    }
                }
                else if (source.Name.NonBlank() is { } name)
                {
                    parts.Add(name);
                }
                else if (source.TmdbId is { } id && Kind != DiscoverRowKind.Library)
                {
                    parts.Add($"#{id.ToString(CultureInfo.InvariantCulture)}");
                }
                var showsMediaType = Kind == DiscoverRowKind.Keyword || Kind == DiscoverRowKind.Company
                    || Kind == DiscoverRowKind.Genre || Kind == DiscoverRowKind.Library;
                if (showsMediaType && source.MediaType is { IsKnown: true } mediaType)
                {
                    parts.Add(mediaType.Label);
                }
            }
            return string.Join(" · ", parts);
        }
    }
}

/// <summary><c>GET /settings/discover</c>, and the answer of <c>PUT</c> and <c>POST …/reset</c>.</summary>
public sealed record DiscoverSettings
{
    /// <summary>Every row in order, hidden ones included.</summary>
    public required IReadOnlyList<DiscoverShelfSetting> Shelves { get; init; }

    /// <summary>Trakt rows need Trakt connected (Settings › Integrations); without it they're empty.</summary>
    public required bool TraktConfigured { get; init; }

    /// <summary>How many rows of their own the admin may add (30).</summary>
    public required int MaxCustomShelves { get; init; }

    public int CustomCount => Shelves.Count(shelf => shelf.Custom);
}

/// <summary>One of <c>GET /settings/discover/lookup</c>'s results: a keyword, studio, network or genre to build a row from.</summary>
public sealed record DiscoverLookupResult
{
    public required int TmdbId { get; init; }
    public required string Name { get; init; }
    public ImageRef? LogoPath { get; init; }

    /// <summary>Tells same-named ones apart (a company's country); null otherwise.</summary>
    public string? Detail { get; init; }

    /// <summary>"A24 (US)", or just the name.</summary>
    public string Label => Detail.NonBlank() is { } detail ? $"{Name} ({detail})" : Name;
}

/// <summary><c>GET /settings/discover/lookup</c>'s <c>type</c>.</summary>
public readonly record struct DiscoverLookupKind(string Value) : IOpenEnum<DiscoverLookupKind>
{
    public static readonly DiscoverLookupKind Keyword = new("keyword");
    public static readonly DiscoverLookupKind Company = new("company");
    public static readonly DiscoverLookupKind Network = new("network");
    public static readonly DiscoverLookupKind Genre = new("genre");

    public static IReadOnlyList<DiscoverLookupKind> Known { get; } = [Keyword, Company, Network, Genre];
    public static DiscoverLookupKind FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;
}

/// <summary>One entry of <c>PUT /settings/discover</c>: a row in its new place, shown or hidden (null leaves it as it is).</summary>
public sealed record DiscoverLayoutEntry(string Id, bool? Hidden = null);

/// <summary><c>PUT /settings/discover</c> body: every row in its new order.</summary>
public sealed record DiscoverLayoutRequest(IReadOnlyList<DiscoverLayoutEntry> Shelves);

/// <summary>
/// <c>POST /settings/discover/shelves</c> body. Null fields are left out:
/// the server names the row after what it shows without a <see cref="Title"/>,
/// and looks the <see cref="Name"/> up from TMDb without one.
/// </summary>
public sealed record NewDiscoverShelfRequest(
    DiscoverRowKind Kind,
    int? TmdbId = null,
    ShelfMediaType? MediaType = null,
    string? Name = null,
    string? Url = null,
    string? Title = null);

/// <summary><c>PATCH /settings/discover/shelves/{id}</c> body: show/hide any row, rename a custom one. Null is left out.</summary>
public sealed record DiscoverShelfPatch(bool? Hidden = null, string? Title = null);

/// <summary>
/// Settings › Discover's editing rules, without the controls: moving a row,
/// the <c>PUT</c> body for an order, what the Add row form asks for per kind
/// and the body it sends. Pure.
/// </summary>
public static class DiscoverLayoutEditing
{
    /// <summary>Longest row name the server takes.</summary>
    public const int MaxTitleLength = 60;

    /// <summary>
    /// <paramref name="shelves"/> with the row at <paramref name="index"/>
    /// moved by <paramref name="offset"/> (−1 up, +1 down); the same list
    /// when it can't move that way.
    /// </summary>
    public static IReadOnlyList<DiscoverShelfSetting> Move(IReadOnlyList<DiscoverShelfSetting> shelves, int index, int offset)
    {
        var target = index + offset;
        if (index < 0 || index >= shelves.Count || target < 0 || target >= shelves.Count || offset == 0)
        {
            return shelves;
        }
        var moved = shelves.ToList();
        var row = moved[index];
        moved.RemoveAt(index);
        moved.Insert(target, row);
        return moved;
    }

    /// <summary><paramref name="shelves"/> with row <paramref name="id"/> shown or hidden.</summary>
    public static IReadOnlyList<DiscoverShelfSetting> SetHidden(IReadOnlyList<DiscoverShelfSetting> shelves, string id, bool hidden) =>
        shelves.Select(shelf => shelf.Id == id ? shelf with { Hidden = hidden } : shelf).ToList();

    /// <summary>The <c>PUT /settings/discover</c> body for <paramref name="shelves"/>: every id, in order, each with its visibility.</summary>
    public static DiscoverLayoutRequest LayoutRequest(IEnumerable<DiscoverShelfSetting> shelves) =>
        new(shelves.Select(shelf => new DiscoverLayoutEntry(shelf.Id, shelf.Hidden)).ToList());

    /// <summary>What the Add row search asks <c>/settings/discover/lookup</c> for; null for a kind without a search.</summary>
    public static DiscoverLookupKind? LookupKind(DiscoverRowKind kind) =>
        kind == DiscoverRowKind.Keyword ? DiscoverLookupKind.Keyword
        : kind == DiscoverRowKind.Company ? DiscoverLookupKind.Company
        : kind == DiscoverRowKind.Network ? DiscoverLookupKind.Network
        : kind == DiscoverRowKind.Genre ? DiscoverLookupKind.Genre
        : null;

    /// <summary>
    /// The movies/series choice a kind offers, first the default: keywords,
    /// studios and the library both or either, genres movies or series,
    /// nothing for the rest (a network is series only).
    /// </summary>
    public static IReadOnlyList<ShelfMediaType> MediaTypeChoices(DiscoverRowKind kind)
    {
        if (kind == DiscoverRowKind.Keyword || kind == DiscoverRowKind.Company || kind == DiscoverRowKind.Library)
        {
            return [ShelfMediaType.All, ShelfMediaType.Movie, ShelfMediaType.Tv];
        }
        if (kind == DiscoverRowKind.Genre)
        {
            return [ShelfMediaType.Movie, ShelfMediaType.Tv];
        }
        return [];
    }

    /// <summary>The Add row search box's placeholder for a kind with a search.</summary>
    public static string SearchPlaceholder(DiscoverRowKind kind) =>
        kind == DiscoverRowKind.Keyword ? Loc.Get("Rows_SearchKeywords")
        : kind == DiscoverRowKind.Company ? Loc.Get("Rows_SearchStudios")
        : kind == DiscoverRowKind.Network ? Loc.Get("Rows_SearchNetworks")
        : kind == DiscoverRowKind.Genre ? Loc.Get("Rows_FilterGenres")
        : "";

    /// <summary>
    /// The <c>POST /settings/discover/shelves</c> body for the Add row form,
    /// or the message to show instead (checked here without asking the
    /// server, in the server's words). <paramref name="picked"/> is the
    /// search result for a keyword, genre, studio or network;
    /// <paramref name="link"/> a TMDb list's number or link, or a Trakt link.
    /// </summary>
    public static (NewDiscoverShelfRequest? Request, string? Error) AddRowRequest(
        DiscoverRowKind kind,
        DiscoverLookupResult? picked,
        ShelfMediaType? mediaType,
        string? link,
        string? title)
    {
        var name = title.NonBlank()?.Trim();
        if (name is { Length: > MaxTitleLength })
        {
            return (null, Loc.Format("Rows_NameTooLong", MaxTitleLength));
        }
        var choices = MediaTypeChoices(kind);
        ShelfMediaType? sentMediaType = choices.Count == 0 ? null
            : mediaType is { } chosen && choices.Contains(chosen) ? chosen
            : choices[0];

        if (kind == DiscoverRowKind.Library)
        {
            return (new NewDiscoverShelfRequest(kind, MediaType: sentMediaType, Title: name), null);
        }
        if (kind == DiscoverRowKind.TraktList)
        {
            if (link.NonBlank() is not { } url)
            {
                return (null, Loc.Get("Rows_NeedTraktLink"));
            }
            return (new NewDiscoverShelfRequest(kind, Url: url.Trim(), Title: name), null);
        }
        if (kind == DiscoverRowKind.TmdbList)
        {
            if (link.NonBlank()?.Trim() is not { } text)
            {
                return (null, Loc.Get("Rows_NeedTmdbList"));
            }
            return int.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out var number) && number > 0
                ? (new NewDiscoverShelfRequest(kind, TmdbId: number, Title: name), null)
                : (new NewDiscoverShelfRequest(kind, Url: text, Title: name), null);
        }
        if (LookupKind(kind) == null)
        {
            return (null, Loc.Get("Rows_PickWhat"));
        }
        if (picked == null)
        {
            return (null, PickMessage(kind));
        }
        return (new NewDiscoverShelfRequest(kind, TmdbId: picked.TmdbId, MediaType: sentMediaType, Name: picked.Name, Title: name), null);
    }

    /// <summary>The server's message for nothing picked: "Pick a keyword.", "Pick a genre.", "Pick a studio.", "Pick a network.".</summary>
    private static string PickMessage(DiscoverRowKind kind) =>
        kind == DiscoverRowKind.Keyword ? Loc.Get("Rows_PickKeyword")
        : kind == DiscoverRowKind.Genre ? Loc.Get("Rows_PickGenre")
        : kind == DiscoverRowKind.Company ? Loc.Get("Rows_PickStudio")
        : kind == DiscoverRowKind.Network ? Loc.Get("Rows_PickNetwork")
        : Loc.Get("Rows_PickWhat");
}
