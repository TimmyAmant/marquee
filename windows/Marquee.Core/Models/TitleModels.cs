using System.Globalization;

namespace Marquee.Core.Models;

// The title page: detail, seasons and episodes (api-v1.md section 3), and the
// response to requesting one (the request-creation part of section 7). The
// library and action-state blocks it embeds are in LibraryModels.cs. Mirrors
// mac/Marquee/API/Models/TitleModels.swift; the nested Swift types are
// top-level records here because C# won't let a property and a nested type
// share a name (`facts: Facts`).

/// <summary>
/// The sidebar and the line under the title. Date labels are pre-formatted
/// in the server's locale and time zone.
/// </summary>
public sealed record TitleFacts
{
    public int? RuntimeMinutes { get; init; }

    /// <summary>"2h 16m" for movies, "~42m/episode" (average) for TV; both null when TMDb has no runtime.</summary>
    public string? RuntimeLabel { get; init; }

    /// <summary>TMDb vote average × 10.</summary>
    public int? RatingPercent { get; init; }

    /// <summary>At most 3.</summary>
    public required IReadOnlyList<string> Genres { get; init; }

    /// <summary>"2011–2019" for an ended show.</summary>
    public string? YearRange { get; init; }

    /// <summary>TMDb's status, "Returning Series" relabeled "Continuing".</summary>
    public string? StatusLabel { get; init; }

    /// <summary>TV only.</summary>
    public string? Network { get; init; }

    /// <summary>"Release Date" (movie) / "First Air Date" (TV).</summary>
    public string? ReleaseDateLabel { get; init; }

    public DateOnly? NextAirDate { get; init; }
    public string? NextAirDateLabel { get; init; }
    public string? OriginalLanguage { get; init; }
    public string? OriginalLanguageLabel { get; init; }
    public ProductionCountry? ProductionCountry { get; init; }

    /// <summary>"Currently Streaming On": US flat-rate providers.</summary>
    public required IReadOnlyList<WatchProvider> WatchProviders { get; init; }
}

public sealed record ProductionCountry
{
    /// <summary>ISO 3166-1, e.g. <c>"US"</c>.</summary>
    public required string Code { get; init; }

    public required string Name { get; init; }

    /// <summary>🇺🇸</summary>
    public required string Flag { get; init; }
}

public sealed record WatchProvider
{
    public required string Name { get; init; }
    public ImageRef? LogoPath { get; init; }
}

/// <summary>Director + Screenplay/Writer (movies) or Creator + Executive Producer (TV), max 6.</summary>
public sealed record TitleCredit
{
    public required string Role { get; init; }
    public required string Name { get; init; }
}

public sealed record TitleLinks
{
    public string? TrailerYoutubeKey { get; init; }
    public string? ImdbId { get; init; }
    public int? TvdbId { get; init; }
    public string? FacebookId { get; init; }
    public string? InstagramId { get; init; }
    public string? TwitterId { get; init; }

    /// <summary>The ordered button row after "▶ Trailer".</summary>
    public required IReadOnlyList<ExternalLink> External { get; init; }

    /// <summary><c>https://www.youtube.com/watch?v={trailerYoutubeKey}</c>.</summary>
    public Uri? TrailerUrl =>
        TrailerYoutubeKey.NonBlank() is { } key
        && Uri.TryCreate("https://www.youtube.com/watch?v=" + Uri.EscapeDataString(key), UriKind.Absolute, out var url)
            ? url
            : null;
}

public sealed record ExternalLink
{
    /// <summary>"IMDb", "TheTVDB", "Instagram", "X / Twitter", "Facebook".</summary>
    public required string Label { get; init; }

    public required string Url { get; init; }

    public Uri? Link => Uri.TryCreate(Url, UriKind.Absolute, out var link) ? link : null;
}

/// <summary>A season row in the "Episodes" accordion.</summary>
public sealed record SeasonSummary
{
    public required int SeasonNumber { get; init; }
    public required string Name { get; init; }
    public required int EpisodeCount { get; init; }
    public DateOnly? AirDate { get; init; }
    public ImageRef? PosterPath { get; init; }

    /// <summary>Sonarr episode-file counts; null when Sonarr doesn't track the show.</summary>
    public int? Have { get; init; }

    public int? Total { get; init; }

    public int Id => SeasonNumber;

    /// <summary>The "3/10" badge, null when Sonarr doesn't track the show.</summary>
    public string? CompletenessLabel =>
        Have is { } have && Total is { } total
            ? $"{have.ToString(CultureInfo.InvariantCulture)}/{total.ToString(CultureInfo.InvariantCulture)}"
            : null;

    /// <summary>Green badge: every episode has a file.</summary>
    public bool IsComplete => Have is { } have && Total is { } total && total > 0 && have >= total;
}

public sealed record CastMember
{
    public required int TmdbId { get; init; }
    public required string Name { get; init; }
    public string? Character { get; init; }
    public ImageRef? ProfilePath { get; init; }

    /// <summary>Billing order.</summary>
    public required int Order { get; init; }

    public required bool Favorited { get; init; }

    public int Id => TmdbId;
}

/// <summary>A TMDb collection (movies) or a curated TV crossover group.</summary>
public sealed record TitleFranchise
{
    public required string Title { get; init; }

    /// <summary>Null for TV groups; the heading's star favorites <c>/favorites/collection/{collectionId}</c>.</summary>
    public int? CollectionId { get; init; }

    public bool? CollectionFavorited { get; init; }

    /// <summary>Oldest first, with status, favorited, requested, canQuickAdd, canRequest.</summary>
    public required IReadOnlyList<TitleCard> Items { get; init; }

    /// <summary>The admin's "Add all N missing" set (empty for members); add each with <c>POST /titles/{type}/{id}/add</c>.</summary>
    public required IReadOnlyList<TitleId> AddAllMissing { get; init; }
}

/// <summary><c>GET /titles/{type}/{tmdbId}</c>: everything the title page renders.</summary>
public sealed record TitleDetail
{
    public required MediaType MediaType { get; init; }
    public required int TmdbId { get; init; }
    public int? TvdbId { get; init; }
    public string? ImdbId { get; init; }
    public required string Name { get; init; }
    public string? Overview { get; init; }
    public string? Tagline { get; init; }
    public ImageRef? PosterPath { get; init; }
    public ImageRef? BackdropPath { get; init; }
    public string? Year { get; init; }

    /// <summary>Raw TMDb release / first-air date.</summary>
    public DateOnly? ReleaseDate { get; init; }

    /// <summary>TMDb's own status, e.g. "Released", "Returning Series".</summary>
    public string? TmdbStatus { get; init; }

    public required TitleFacts Facts { get; init; }
    public required IReadOnlyList<TitleCredit> Credits { get; init; }
    public required IReadOnlyList<string> Keywords { get; init; }
    public required TitleLinks Links { get; init; }
    public required TitleLibraryInfo Library { get; init; }

    /// <summary>Decides the action area under the title (see <see cref="TitleViewerState"/>).</summary>
    public required TitleViewerState Viewer { get; init; }

    /// <summary>TV only: seasons with episodes, newest first. Load episodes with <c>Titles.SeasonAsync</c>.</summary>
    public required IReadOnlyList<SeasonSummary> Seasons { get; init; }

    /// <summary>Top 20 by billing order.</summary>
    public required IReadOnlyList<CastMember> Cast { get; init; }

    public TitleFranchise? Franchise { get; init; }

    /// <summary>Heading "Studio".</summary>
    public required IReadOnlyList<CompanyCard> Studios { get; init; }

    /// <summary>TMDb recommendations, heading "More like this".</summary>
    public required IReadOnlyList<TitleCard> Similar { get; init; }

    public TitleId Id => new(MediaType, TmdbId);

    /// <summary>
    /// The same title with a fresh <c>library</c> + <c>viewer</c> from
    /// <c>Titles.StatusAsync</c>, for updating the page after add / request /
    /// monitor / favorite without re-fetching the whole thing.
    /// </summary>
    public TitleDetail Updating(TitleStatus status) => this with { Library = status.Library, Viewer = status.Viewer };
}

/// <summary><c>GET /titles/tv/{tmdbId}/seasons/{n}</c>: one expanded accordion row.</summary>
public sealed record SeasonEpisodes
{
    public required int TmdbId { get; init; }
    public required int SeasonNumber { get; init; }

    /// <summary>Empty: "No episode data for this season."</summary>
    public required IReadOnlyList<Episode> Episodes { get; init; }
}

public sealed record Episode
{
    /// <summary>The website truncates episode overviews at this many characters.</summary>
    public const int OverviewLimit = 220;

    /// <summary>TMDb episode id.</summary>
    public required int Id { get; init; }

    public required int EpisodeNumber { get; init; }
    public required string Name { get; init; }
    public string? Overview { get; init; }
    public DateOnly? AirDate { get; init; }
    public ImageRef? StillPath { get; init; }

    /// <summary>Sonarr's "Have it" / "Missing"; null when Sonarr doesn't track the show.</summary>
    public bool? HasFile { get; init; }

    /// <summary>"S01E03".</summary>
    public string Code(int season) =>
        $"S{season.ToString("00", CultureInfo.InvariantCulture)}E{EpisodeNumber.ToString("00", CultureInfo.InvariantCulture)}";

    /// <summary>The overview cut the way the website's line clamp does, with a trailing "…".</summary>
    public string? ShortOverview => Overview == null ? null : Truncate(Overview, OverviewLimit);

    /// <summary>Cut at <paramref name="limit"/> characters with a trailing "…" (the website's line clamps).</summary>
    internal static string Truncate(string text, int limit) =>
        text.Length <= limit ? text : text[..limit].Trim() + "…";
}

/// <summary>
/// <c>POST /titles/{type}/{tmdbId}/request</c> response (the Mac's
/// <c>RequestCreated</c>; named for the title page here so it can't collide
/// with the requests area's own models).
/// </summary>
public sealed record TitleRequestCreated
{
    public required bool Ok { get; init; }
    public required Guid RequestId { get; init; }
}
