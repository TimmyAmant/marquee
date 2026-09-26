using System.Globalization;

namespace Marquee.Core.Models;

// Library status and the Sonarr/Radarr actions on a title (api-v1.md
// section 4). Mirrors mac/Marquee/API/Models/LibraryModels.swift.

/// <summary><c>library</c> on the title page and <c>GET …/status</c>.</summary>
public sealed record TitleLibraryInfo
{
    /// <summary>Always shown as the title's status badge.</summary>
    public required LibraryStatus Status { get; init; }

    /// <summary>Where ownership came from; null when nothing has the title.</summary>
    public LibraryProvider? Provider { get; init; }

    /// <summary>The library owner's Radarr (movies) / Sonarr (TV) has a root folder and quality profile.</summary>
    public required bool Configured { get; init; }

    /// <summary>The "File details" card; non-null only for <c>owned</c> titles.</summary>
    public FileDetails? File { get; init; }
}

/// <summary>
/// The "File details" card. Movie-only fields are null for TV, and which
/// fields are filled depends on what owns the title (see the doc's table):
/// where both an *arr and a media server know a field, the *arr's value
/// wins, since it is authoritative about the release it fetched.
/// </summary>
public sealed record FileDetails
{
    /// <summary>"Location" (with Copy).</summary>
    public string? Path { get; init; }

    public required long SizeBytes { get; init; }

    /// <summary>The quality profile name, e.g. "Bluray-2160p".</summary>
    public string? Quality { get; init; }

    public ResolutionTier? ResolutionTier { get; init; }

    /// <summary>e.g. "3840x1600".</summary>
    public string? Resolution { get; init; }

    public string? VideoCodec { get; init; }

    /// <summary><c>"DV" | "HDR10" | "HDR10Plus" | "HLG" | "PQ" | "SDR"</c>; null means "not known", not "SDR".</summary>
    public string? DynamicRange { get; init; }

    public string? AudioCodec { get; init; }

    /// <summary>e.g. 7.1.</summary>
    public double? AudioChannels { get; init; }

    public DateTimeOffset? DateAdded { get; init; }
    public string? ReleaseGroup { get; init; }
    public string? Edition { get; init; }

    /// <summary>"MKV"/"MP4", from Plex or Jellyfin; the *arrs don't report it (older servers omit the key).</summary>
    public string? Container { get; init; }

    /// <summary>Whole-file bitrate in kbps, e.g. 58421. Media servers only (older servers omit the key).</summary>
    public int? BitrateKbps { get; init; }

    /// <summary>"29.1 GB".</summary>
    public string SizeLabel => FormatBytes(SizeBytes);

    /// <summary>The "Resolution" row: <c>resolutionTier ?? resolution</c>.</summary>
    public string? ResolutionLabel => ResolutionTier?.Value ?? Resolution.NonBlank();

    /// <summary>"Dynamic range": "Dolby Vision", "HDR10+", or as sent.</summary>
    public string? DynamicRangeLabel => HdrLabel(DynamicRange);

    /// <summary>"58.4 Mbps", or "820 kbps" below a megabit.</summary>
    public string? BitrateLabel
    {
        get
        {
            if (BitrateKbps is not { } kbps || kbps <= 0)
            {
                return null;
            }
            return kbps < 1000
                ? $"{kbps.ToString(CultureInfo.InvariantCulture)} kbps"
                : $"{(kbps / 1000.0).ToString("0.0", CultureInfo.InvariantCulture)} Mbps";
        }
    }

    /// <summary>The "Audio" row: "TrueHD Atmos 7.1ch".</summary>
    public string? AudioLabel
    {
        get
        {
            if (AudioCodec.NonBlank() is not { } codec)
            {
                return null;
            }
            if (AudioChannels is not { } channels)
            {
                return codec;
            }
            // "2ch", not "2.0ch": the website drops a whole number's fraction.
            var count = Math.Round(channels) == channels
                ? ((int)channels).ToString(CultureInfo.InvariantCulture)
                : channels.ToString(CultureInfo.InvariantCulture);
            return $"{codec} {count}ch";
        }
    }

    /// <summary>Port of lib/format.ts's <c>formatBytes</c>: one decimal, 1024-based units.</summary>
    private static string FormatBytes(long bytes)
    {
        if (bytes <= 0)
        {
            return "0 B";
        }
        string[] units = ["B", "KB", "MB", "GB", "TB"];
        var exponent = Math.Min((int)Math.Floor(Math.Log(bytes) / Math.Log(1024)), units.Length - 1);
        var value = bytes / Math.Pow(1024, exponent);
        return $"{value.ToString("0.0", CultureInfo.InvariantCulture)} {units[exponent]}";
    }

    /// <summary>Port of lib/quality.ts's <c>hdrLabel</c>.</summary>
    private static string? HdrLabel(string? dynamicRange)
    {
        if (string.IsNullOrEmpty(dynamicRange))
        {
            return null;
        }
        if (string.Equals(dynamicRange, "dv", StringComparison.OrdinalIgnoreCase))
        {
            return "Dolby Vision";
        }
        if (string.Equals(dynamicRange, "hdr10plus", StringComparison.OrdinalIgnoreCase))
        {
            return "HDR10+";
        }
        return dynamicRange;
    }
}

/// <summary>Radarr/Sonarr has the title (admin only).</summary>
public sealed record ArrTracking
{
    /// <summary>The movie/series id inside Radarr/Sonarr.</summary>
    public required int ArrId { get; init; }

    public required bool Monitored { get; init; }
}

/// <summary><c>viewer</c> on the title page: which actions to show under the title.</summary>
public sealed record TitleViewerState
{
    public required bool IsAdmin { get; init; }

    /// <summary>The star (<c>PUT</c>/<c>DELETE /favorites/{type}/{tmdbId}</c>).</summary>
    public required bool Favorited { get; init; }

    /// <summary>Your active request, if any.</summary>
    public RequestStatus? RequestStatus { get; init; }

    /// <summary>Show the website's "Requested, waiting for approval" state instead of the Request button.
    public required bool AlreadyRequested { get; init; }

    /// <summary>"Also requested by A, B" when non-empty and you haven't requested.</summary>
    public required IReadOnlyList<string> OtherRequesters { get; init; }

    /// <summary>"Add to Radarr/Sonarr" (<c>POST …/add</c>).</summary>
    public required bool CanAdd { get; init; }

    /// <summary>"Connect Radarr/Sonarr to add this title" (admin: a link to Integrations).</summary>
    public required bool NeedsArrSetup { get; init; }

    /// <summary>"Request" (<c>POST …/request</c>).</summary>
    public required bool CanRequest { get; init; }

    /// <summary>"Wrong match? Fix ID" (<c>POST …/relink</c>).</summary>
    public required bool CanRelink { get; init; }

    /// <summary>"Search now" and "Stop/Start monitoring" when non-null.</summary>
    public ArrTracking? ArrTracking { get; init; }

    /// <summary>
    /// TV: at least one season can be requested (season picker, "Request more
    /// seasons"). Null from a server older than season requests, which only
    /// takes whole-series requests.
    /// </summary>
    public bool? CanRequestSeasons { get; init; }

    /// <summary>The seasons of your pending request; null when there's none or it's for the whole series.</summary>
    public IReadOnlyList<int>? RequestedSeasons { get; init; }

    /// <summary>
    /// The 4K copy (0.37+), when the admin has set up a 4K Radarr (movies) /
    /// 4K Sonarr (TV); null otherwise, and from an older server.
    /// </summary>
    public FourKViewerState? FourK { get; init; }

    /// <summary>
    /// "Report a problem" shows (0.38+): the title, or its 4K copy, is owned
    /// or downloading. An older server leaves it out, which hides it.
    /// </summary>
    public bool CanReport { get; init; }

    /// <summary>Your own open problem reports for this title (0.38+; 0 when left out): "Problem reported" instead of the button.</summary>
    public int OpenReports { get; init; }

    /// <summary>"Requested Seasons 1–3, waiting for approval", or without the seasons for a whole-series request.</summary>
    public string PendingRequestLine =>
        SeasonLabels.SeasonsLabel(RequestedSeasons) is { } label
            ? $"Requested {label}, waiting for approval"
            : "Requested, waiting for approval";

    /// <summary>"Also requested by A, B", or null when it shouldn't show.</summary>
    public string? OtherRequestersLine =>
        OtherRequesters.Count == 0 || AlreadyRequested ? null : $"Also requested by {string.Join(", ", OtherRequesters)}";
}

/// <summary>
/// <c>viewer.fourK</c> (0.37+): the title in the 4K Radarr/Sonarr, read live
/// and independent of <c>library.status</c>. components/fourk-controls.tsx.
/// </summary>
public sealed record FourKViewerState
{
    /// <summary>How the 4K instance has the title; <see cref="LibraryStatus.Untracked"/> when it doesn't.</summary>
    public required LibraryStatus Status { get; init; }

    /// <summary>Your own 4K request (pending/approved); null when none or declined.</summary>
    public RequestStatus? RequestStatus { get; init; }

    /// <summary>"Request in 4K" (<c>POST …/request</c> with <c>{"is4k": true}</c>).</summary>
    public required bool CanRequest { get; init; }

    /// <summary>"Add to 4K Radarr/Sonarr" (admin; <c>POST …/add</c> with <c>{"is4k": true}</c>).</summary>
    public required bool CanAdd { get; init; }

    /// <summary>The gold outline chip: "In 4K", "4K downloading", "4K missing", "4K coming soon"; null when untracked (or unknown).</summary>
    public string? StatusLabel
    {
        get
        {
            if (Status == LibraryStatus.Owned) return "In 4K";
            if (Status == LibraryStatus.TrackedDownloading) return "4K downloading";
            if (Status == LibraryStatus.TrackedMonitored) return "4K missing";
            if (Status == LibraryStatus.ComingSoon) return "4K coming soon";
            return null;
        }
    }

    /// <summary>The "4K requested" chip, while your 4K request is pending.</summary>
    public bool IsRequested => RequestStatus == Models.RequestStatus.Pending;
}

/// <summary><c>POST …/request</c> and <c>POST …/add</c> body for the 4K copy (0.37+).</summary>
public sealed record FourKBody(bool Is4k);

/// <summary>
/// <c>GET /titles/{type}/{tmdbId}/status</c>: just <c>library</c> +
/// <c>viewer</c>, the cheap refresh after add / request / monitor / favorite.
/// </summary>
public sealed record TitleStatus
{
    public required MediaType MediaType { get; init; }
    public required int TmdbId { get; init; }
    public required TitleLibraryInfo Library { get; init; }
    public required TitleViewerState Viewer { get; init; }

    public TitleId Id => new(MediaType, TmdbId);
}

/// <summary><c>PUT …/monitored</c> body.</summary>
public sealed record SetMonitoredRequest(bool Monitored);

/// <summary><c>PUT …/monitored</c> response.</summary>
public sealed record MonitoredResult
{
    public required bool Ok { get; init; }
    public required bool Monitored { get; init; }
}

/// <summary>
/// "Wrong match? Fix ID": the id to repoint the title to. Exactly one of the
/// three is set, and only that key goes on the wire; the server checks
/// <c>tmdbId</c>, then <c>imdbId</c>, then <c>tvdbId</c> (TV only).
/// </summary>
public sealed record RelinkTarget
{
    private RelinkTarget()
    {
    }

    public int? TmdbId { get; init; }

    /// <summary><c>tt0133093</c> or <c>0133093</c>.</summary>
    public string? ImdbId { get; init; }

    public int? TvdbId { get; init; }

    public static RelinkTarget Tmdb(int id) => new() { TmdbId = id };
    public static RelinkTarget Imdb(string id) => new() { ImdbId = id };
    public static RelinkTarget Tvdb(int id) => new() { TvdbId = id };
}

/// <summary><c>POST …/relink</c> response: navigate to <see cref="NewTmdbId"/> afterwards.</summary>
public sealed record RelinkResult
{
    public required bool Ok { get; init; }
    public required int NewTmdbId { get; init; }
}
