using System.Globalization;
using Marquee.Core.Localization;

namespace Marquee.Core.Models;

// The Library page (api-v1.md section 17, 0.51+): everything the household
// owns across Plex, Jellyfin, Sonarr and Radarr, the franchises it has part
// of, the admin's duplicates and the disks. Mirrors lib/api/types.ts's
// "Library page" block. A server older than 0.51 answers 404 on each call.

/// <summary><c>LibraryEntry.resolution</c>: the file's tier. <c>SD</c> is known and below 720p.</summary>
public readonly record struct LibraryResolution(string Value) : IOpenEnum<LibraryResolution>
{
    public static readonly LibraryResolution Uhd = new("4K");
    public static readonly LibraryResolution FullHd = new("1080p");
    public static readonly LibraryResolution Hd = new("720p");
    public static readonly LibraryResolution Sd = new("SD");

    public static IReadOnlyList<LibraryResolution> Known { get; } = [Uhd, FullHd, Hd, Sd];
    public static LibraryResolution FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    /// <summary>The wire value is the label in every language ("4K", "1080p"), like the website.</summary>
    public string Label => Value;
}

/// <summary><c>GET /library</c>'s <c>?sort=</c>. Closed: the app offers exactly these.</summary>
public enum LibrarySort
{
    /// <summary>Newest <c>addedAt</c> first, then Sonarr/Radarr-only rows by year (the default).</summary>
    Recent,
    Title,
    Year,
    Size,
    Rating,
}

public static class LibrarySortExtensions
{
    /// <summary>Every sort, in the picker's order.</summary>
    public static IReadOnlyList<LibrarySort> All { get; } = [LibrarySort.Recent, LibrarySort.Title, LibrarySort.Year, LibrarySort.Size, LibrarySort.Rating];

    /// <summary>The wire value.</summary>
    public static string Value(this LibrarySort sort) => sort switch
    {
        LibrarySort.Recent => "recent",
        LibrarySort.Title => "title",
        LibrarySort.Year => "year",
        LibrarySort.Size => "size",
        LibrarySort.Rating => "rating",
        _ => throw new ArgumentOutOfRangeException(nameof(sort)),
    };

    /// <summary>The picker's label: "Recently added", "Title", "Year", "Size", "Rating".</summary>
    public static string Label(this LibrarySort sort) => sort switch
    {
        LibrarySort.Recent => Loc.Get("Library_SortRecent"),
        LibrarySort.Title => Loc.Get("Library_SortTitle"),
        LibrarySort.Year => Loc.Get("Library_SortYear"),
        LibrarySort.Size => Loc.Get("Library_SortSize"),
        LibrarySort.Rating => Loc.Get("Library_SortRating"),
        _ => sort.ToString(),
    };
}

/// <summary>
/// One row of <c>GET /library</c>: a <see cref="TitleCard"/> (with
/// <c>status</c> always set) plus what's known about its file. A title on
/// several servers is one row: a media server's copy wins over
/// Sonarr/Radarr's unless it's downloading.
/// </summary>
public sealed record LibraryEntry
{
    // MARK: The TitleCard part

    public required MediaType MediaType { get; init; }
    public required int TmdbId { get; init; }
    public required string Name { get; init; }
    public ImageRef? PosterPath { get; init; }
    public string? Year { get; init; }
    public string? Subtitle { get; init; }
    public string? Overview { get; init; }
    public double? Rating { get; init; }

    /// <summary>Never null here; nullable so a card built from it decodes like any other.</summary>
    public LibraryStatus? Status { get; init; }

    public bool? Favorited { get; init; }
    public bool? Requested { get; init; }
    public required bool CanQuickAdd { get; init; }
    public required bool CanRequest { get; init; }

    // MARK: The file

    /// <summary>TheTVDB id (series).</summary>
    public int? TvdbId { get; init; }

    /// <summary>Where the row came from.</summary>
    public required LibraryProvider Source { get; init; }

    public long? SizeBytes { get; init; }

    /// <summary>When the media server added it; null for a Sonarr/Radarr-only title.</summary>
    public DateTimeOffset? AddedAt { get; init; }

    public IReadOnlyList<string> Genres { get; init; } = [];

    /// <summary>The file's tier; null when nothing describes a file (a monitored-only title).</summary>
    public LibraryResolution? Resolution { get; init; }

    /// <summary>"HDR10", "HDR10+", "Dolby Vision"…; null for SDR or unknown.</summary>
    public string? Hdr { get; init; }

    public string? VideoCodec { get; init; }
    public string? AudioCodec { get; init; }

    /// <summary>Radarr's quality profile name for the file ("Bluray-2160p").</summary>
    public string? Quality { get; init; }

    /// <summary>The admin only; null for members.</summary>
    public string? FilePath { get; init; }

    /// <summary>Series: episode files on disk; null when unknown (Jellyfin doesn't report it).</summary>
    public int? EpisodeCount { get; init; }

    /// <summary>Series: aired episodes on disk against aired episodes (the poster's "96/96"); null for movies and from older servers.</summary>
    public EpisodeCounts? Episodes { get; init; }

    /// <summary>Radarr: the file is below the quality cutoff.</summary>
    public bool UpgradeAvailable { get; init; }

    /// <summary>Sonarr/Radarr and the media server report different paths (see <c>/library/duplicates</c>).</summary>
    public bool PossibleDuplicate { get; init; }

    /// <summary>The admin only: Radarr/Sonarr has the title, so "Search now" and "Stop/Start monitoring" apply.</summary>
    public ArrTracking? ArrTracking { get; init; }

    public TitleId Id => new(MediaType, TmdbId);

    /// <summary>The card part, for a poster tile.</summary>
    public TitleCard ToTitleCard() => new()
    {
        MediaType = MediaType,
        TmdbId = TmdbId,
        Name = Name,
        PosterPath = PosterPath,
        Year = Year,
        Subtitle = Subtitle,
        Overview = Overview,
        Rating = Rating,
        Status = Status,
        Favorited = Favorited,
        Requested = Requested,
        CanQuickAdd = CanQuickAdd,
        CanRequest = CanRequest,
        Episodes = Episodes,
    };

    /// <summary>"29.1 GB", or null without a size.</summary>
    public string? SizeLabel => SizeBytes is { } bytes ? FileDetails.FormatBytes(bytes) : null;

    /// <summary>"61 episodes", or null when unknown.</summary>
    public string? EpisodesLabel => EpisodeCount is { } count ? Loc.Plural("Library_CountEpisodes", count) : null;

    /// <summary>"Plex · 29.1 GB · 61 episodes": the source, the size and (series) the episode count, whichever are known.</summary>
    public string MetaLine => string.Join(" · ", new[] { Source.DisplayName, SizeLabel, EpisodesLabel }.OfType<string>());

    /// <summary>
    /// "4K · Dolby Vision · HEVC · TrueHD Atmos": the tier, HDR, video and
    /// audio codecs, whichever are known; Radarr's quality name when none
    /// is; null when nothing describes the file.
    /// </summary>
    public string? QualityLabel
    {
        get
        {
            var parts = new[] { Resolution?.Label, Hdr.NonBlank(), VideoCodec.NonBlank(), AudioCodec.NonBlank() }.OfType<string>().ToList();
            return parts.Count > 0 ? string.Join(" · ", parts) : Quality.NonBlank();
        }
    }
}

/// <summary><c>summary</c>: the header counts, for the whole library rather than the page.</summary>
public sealed record LibraryPageSummary
{
    public required int Movies { get; init; }
    public required int Series { get; init; }

    /// <summary>Episode files on disk (Sonarr and Plex report them; Jellyfin doesn't).</summary>
    public required int Episodes { get; init; }

    public required long TotalBytes { get; init; }

    /// <summary>Rows not on disk yet: downloading, missing, coming soon.</summary>
    public required int Tracked { get; init; }
}

/// <summary><c>filters</c>: what the pickers offer, only values present in this library.</summary>
public sealed record LibraryFilters
{
    public required IReadOnlyList<LibraryProvider> Sources { get; init; }
    public required IReadOnlyList<string> Genres { get; init; }
    public required IReadOnlyList<string> Codecs { get; init; }
    public required IReadOnlyList<int> Years { get; init; }
    public required IReadOnlyList<LibraryResolution> Resolutions { get; init; }
    public required bool HasHdr { get; init; }

    public static LibraryFilters Empty { get; } = new()
    {
        Sources = [],
        Genres = [],
        Codecs = [],
        Years = [],
        Resolutions = [],
        HasHdr = false,
    };
}

/// <summary><c>GET /library</c>: one page, the counts, the pickers' choices and whether anything is connected.</summary>
public sealed record LibraryResults
{
    public required int Page { get; init; }
    public required int PageSize { get; init; }
    public required int TotalPages { get; init; }
    public required int TotalResults { get; init; }
    public required IReadOnlyList<LibraryEntry> Results { get; init; }
    public required LibraryPageSummary Summary { get; init; }
    public required LibraryFilters Filters { get; init; }

    /// <summary>False when neither Plex, Jellyfin, Sonarr nor Radarr is connected: the "Connect …" empty state.</summary>
    public required bool Connected { get; init; }

    public bool HasMorePages => Page < TotalPages;
}

/// <summary><c>GET /library/collections-missing</c>: a franchise the library has part of but not all of.</summary>
public sealed record LibraryCollection
{
    public required string Key { get; init; }
    public required string Title { get; init; }

    /// <summary>The TMDb collection (movies); null for a hand-curated TV group.</summary>
    public int? CollectionId { get; init; }

    public bool? CollectionFavorited { get; init; }

    /// <summary>Every part, in release order, with the library status of each (null = missing).</summary>
    public required IReadOnlyList<TitleCard> Items { get; init; }

    public required int MissingCount { get; init; }

    /// <summary>The admin's "Add all N missing" set (each through <c>POST /titles/{type}/{id}/add</c>); empty for members.</summary>
    public required IReadOnlyList<TitleId> AddAllMissing { get; init; }

    /// <summary>A member's "Request all N missing" set; empty for the admin.</summary>
    public required IReadOnlyList<TitleId> RequestAllMissing { get; init; }

    /// <summary>An owned part, the target of <c>POST /titles/{type}/{id}/request-all-missing</c>.</summary>
    public required TitleId RequestAllTarget { get; init; }

    /// <summary>"The Matrix Collection · 2 missing".</summary>
    public string Heading => LibraryText.CollectionHeading(Title, MissingCount);
}

/// <summary><c>LibraryDuplicate.reason</c>: why the title is listed.</summary>
public readonly record struct LibraryDuplicateReason(string Value) : IOpenEnum<LibraryDuplicateReason>
{
    /// <summary>Two or more copies name different files (a stale grab after an upgrade, most often).</summary>
    public static readonly LibraryDuplicateReason Paths = new("paths");

    /// <summary>Two media servers list it, whether or not the paths are known.</summary>
    public static readonly LibraryDuplicateReason Servers = new("servers");

    public static IReadOnlyList<LibraryDuplicateReason> Known { get; } = [Paths, Servers];
    public static LibraryDuplicateReason FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    /// <summary>The pill: "Different files" / "On several servers".</summary>
    public string Label => this == Paths ? Loc.Get("Library_ReasonPaths") : this == Servers ? Loc.Get("Library_ReasonServers") : OpenEnum.Capitalized(Value);
}

/// <summary>One copy of a duplicated title.</summary>
public sealed record LibraryCopy
{
    public required LibraryProvider Source { get; init; }

    /// <summary>The server's name in Settings ("Tower", "4K Radarr").</summary>
    public required string Server { get; init; }

    public string? FilePath { get; init; }
    public long? SizeBytes { get; init; }

    /// <summary>A media server's resolution or the arr's quality profile.</summary>
    public string? Quality { get; init; }

    /// <summary>"Tower · Plex", or just the name when it already is the provider's ("Radarr").</summary>
    public string ServerLine => LibraryText.ServerLine(Server, Source);

    public string? SizeLabel => SizeBytes is { } bytes ? FileDetails.FormatBytes(bytes) : null;
}

/// <summary><c>GET /library/duplicates</c> (admin): a title in more than one file or on more than one server, with every copy.</summary>
public sealed record LibraryDuplicate
{
    public required MediaType MediaType { get; init; }
    public required int TmdbId { get; init; }
    public required string Name { get; init; }
    public ImageRef? PosterPath { get; init; }
    public string? Year { get; init; }
    public required LibraryDuplicateReason Reason { get; init; }
    public required IReadOnlyList<LibraryCopy> Copies { get; init; }

    public TitleId Id => new(MediaType, TmdbId);
}

/// <summary>One Sonarr/Radarr root folder (a disk shared by two folders is listed once per path).</summary>
public sealed record LibraryStorageFolder
{
    public required string Path { get; init; }
    public required long FreeBytes { get; init; }

    /// <summary>The Sonarr/Radarr servers with this root folder; empty from a snapshot.</summary>
    public required IReadOnlyList<string> Servers { get; init; }

    /// <summary>"812.0 GB free".</summary>
    public string FreeLabel => LibraryText.FreeLabel(FreeBytes);

    /// <summary>"Radarr · 4K Radarr".</summary>
    public string ServersLine => string.Join(" · ", Servers);
}

/// <summary><c>forecast</c>: from the daily disk-space snapshot, once free space is seen shrinking.</summary>
public sealed record LibraryForecast
{
    public required int DaysRemaining { get; init; }
    public required long BytesPerDay { get; init; }

    /// <summary>The calendar day the disk fills at this rate.</summary>
    public required DateOnly FullOn { get; init; }
}

/// <summary><c>GET /library/storage</c>: the Storage card.</summary>
public sealed record LibraryStorage
{
    public required IReadOnlyList<LibraryStorageFolder> Folders { get; init; }
    public required long TotalFreeBytes { get; init; }

    /// <summary>When the figures were read; null when there's nothing.</summary>
    public DateTimeOffset? MeasuredAt { get; init; }

    /// <summary>True: read from the servers just now; false: the newest daily snapshot.</summary>
    public required bool Live { get; init; }

    /// <summary>Null until two days of snapshots show free space shrinking by at least 100 MB a day.</summary>
    public LibraryForecast? Forecast { get; init; }

    /// <summary>Nothing connected and no snapshots: the "Connect Sonarr or Radarr" empty state.</summary>
    public bool IsEmpty => Folders.Count == 0;

    /// <summary>"1.5 TB free".</summary>
    public string TotalFreeLabel => LibraryText.FreeLabel(TotalFreeBytes);
}

/// <summary>
/// <c>GET /library</c>'s filters. <see cref="Default"/> is the website's
/// unfiltered view, sorted by recently added; <see cref="ToQuery"/> leaves
/// every default out so the plain page is a plain <c>GET /library</c>.
/// </summary>
public sealed record LibraryQuery
{
    public static LibraryQuery Default { get; } = new();

    public MediaType? Type { get; init; }

    /// <summary>Never <see cref="LibraryStatus.Untracked"/>: the library has nothing untracked.</summary>
    public LibraryStatus? Status { get; init; }

    public LibraryProvider? Source { get; init; }
    public LibraryResolution? Resolution { get; init; }

    /// <summary>Only files with HDR or Dolby Vision.</summary>
    public bool Hdr { get; init; }

    /// <summary>A video codec as the media server spells it ("HEVC"), case-insensitive.</summary>
    public string? Codec { get; init; }

    /// <summary>A TMDb genre name, case-insensitive.</summary>
    public string? Genre { get; init; }

    /// <summary>1800 to 3000.</summary>
    public int? Year { get; init; }

    /// <summary>Title contains (case-insensitive); blank means none.</summary>
    public string? Q { get; init; }

    public LibrarySort Sort { get; init; } = LibrarySort.Recent;

    /// <summary>Anything narrows the list: "No titles match these filters." rather than "Still syncing".</summary>
    public bool HasFilters =>
        Type != null || Status != null || Source != null || Resolution != null || Hdr
        || Codec.NonBlank() != null || Genre.NonBlank() != null || Year != null || Q.NonBlank() != null;

    /// <summary>The query for <paramref name="page"/>; a null value leaves its key out, and so does a default.</summary>
    public IReadOnlyDictionary<string, string?> ToQuery(int page) => new Dictionary<string, string?>
    {
        ["type"] = Type?.Value,
        ["status"] = Status?.Value,
        ["source"] = Source?.Value,
        ["resolution"] = Resolution?.Value,
        ["hdr"] = Hdr ? "1" : null,
        ["codec"] = Codec.NonBlank(),
        ["genre"] = Genre.NonBlank(),
        ["year"] = Year?.ToString(CultureInfo.InvariantCulture),
        ["q"] = Q.NonBlank(),
        ["sort"] = Sort == LibrarySort.Recent ? null : Sort.Value(),
        ["page"] = page > 1 ? page.ToString(CultureInfo.InvariantCulture) : null,
    };
}

/// <summary>
/// Every line the Library page writes from its data, in one place so the
/// wording (the website's lib/i18n/messages/*/library.json) is tested once
/// and shared by the grid, the table and the Storage card.
/// </summary>
public static class LibraryText
{
    /// <summary>"640 movies · 172 series · 9,840 episodes · 43.7 TB on disk".</summary>
    public static string CountsLine(LibraryPageSummary summary) => string.Join(" · ",
    [
        Loc.Plural("Library_CountMovies", summary.Movies),
        Loc.Plural("Library_CountSeries", summary.Series),
        Loc.Plural("Library_CountEpisodes", summary.Episodes),
        Loc.Format("Library_OnDisk", FileDetails.FormatBytes(summary.TotalBytes)),
    ]);

    /// <summary>"+ 23 more downloading, missing or coming soon, not counted above", or null when nothing is tracked.</summary>
    public static string? TrackedNote(LibraryPageSummary summary) =>
        summary.Tracked > 0 ? Loc.Plural("Library_TrackedNote", summary.Tracked) : null;

    /// <summary>"The Matrix Collection · 2 missing".</summary>
    public static string CollectionHeading(string title, int missingCount) =>
        $"{title} · {Loc.Plural("Library_MissingCount", missingCount)}";

    /// <summary>"Tower · Plex"; just "Radarr" when the server is named for its provider.</summary>
    public static string ServerLine(string server, LibraryProvider source) =>
        string.Equals(server, source.DisplayName, StringComparison.OrdinalIgnoreCase) ? server : $"{server} · {source.DisplayName}";

    /// <summary>"812.0 GB free".</summary>
    public static string FreeLabel(long bytes) => Loc.Format("Library_StorageFree", FileDetails.FormatBytes(bytes));

    /// <summary>
    /// "Full in about 42 days at the current rate (11.5 GB/day).", "Full
    /// today at the current rate (…)." when no days remain, or the "No
    /// forecast yet" sentence without a forecast.
    /// </summary>
    public static string ForecastLine(LibraryForecast? forecast)
    {
        if (forecast == null)
        {
            return Loc.Get("Library_StorageNoForecast");
        }
        var perDay = FileDetails.FormatBytes(forecast.BytesPerDay);
        return forecast.DaysRemaining <= 0
            ? Loc.Format("Library_StorageFullToday", perDay)
            : Loc.Plural("Library_StorageFullIn", forecast.DaysRemaining, perDay);
    }

    /// <summary>"Around November 7, 2026.", or null without a forecast.</summary>
    public static string? AroundLine(LibraryForecast? forecast) =>
        forecast == null ? null : Loc.Format("Library_StorageFullOn", forecast.FullOn.ToString(Loc.Get("Format_LongDatePattern"), CultureInfo.CurrentCulture));

    /// <summary>
    /// "Read from your servers just now." when live, "From the last daily
    /// snapshot, Sep 26, 2026 9:10 PM." from a snapshot, null when nothing
    /// was measured.
    /// </summary>
    public static string? MeasuredLine(LibraryStorage storage)
    {
        if (storage.Live)
        {
            return Loc.Get("Library_StorageLive");
        }
        if (storage.MeasuredAt is not { } measured)
        {
            return null;
        }
        var local = measured.ToLocalTime();
        var date = Loc.Format(
            "Format_DateAndTime",
            local.ToString(Loc.Get("Format_ShortDatePattern"), CultureInfo.CurrentCulture),
            local.ToString("t", CultureInfo.CurrentCulture));
        return Loc.Format("Library_StorageSnapshot", date);
    }

    /// <summary>The Storage card's empty state: the admin is told what to connect, a member that the admin hasn't.</summary>
    public static string StorageEmptyMessage(bool isAdmin) =>
        isAdmin ? Loc.Get("Library_StorageEmpty") : Loc.Get("Library_StorageEmptyMember");

    /// <summary>The page's "nothing connected" state, likewise.</summary>
    public static string ConnectMessage(bool isAdmin) =>
        isAdmin ? Loc.Get("Library_ConnectAdmin") : Loc.Get("Library_ConnectMember");
}
