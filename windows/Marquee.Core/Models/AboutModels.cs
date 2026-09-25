using System.Globalization;

namespace Marquee.Core.Models;

// Settings, About and the Releases page (api-v1.md section 14). Mirrors
// mac/Marquee/API/Models/AboutModels.swift.

/// <summary>
/// <c>GET /settings/about</c>. Website rows: Version, Movies, TV Shows,
/// Tracked (not yet owned), Total Requests, Time Zone; "Getting Support":
/// Changelog, Error reference, GitHub, Report an issue. Counts are the
/// household library's.
/// </summary>
public sealed record AboutInfo
{
    public required string Version { get; init; }

    /// <summary>Owned movies.</summary>
    public required int MovieCount { get; init; }

    /// <summary>Owned shows.</summary>
    public required int TvCount { get; init; }

    /// <summary>Tracked but not owned.</summary>
    public required int TrackedCount { get; init; }

    public required int TotalRequests { get; init; }

    /// <summary>The server's IANA time zone, e.g. <c>America/New_York</c>.</summary>
    public required string TimeZone { get; init; }

    public required string RepoUrl { get; init; }
    public required string IssuesUrl { get; init; }

    /// <summary>"v0.22.0", the Version row.</summary>
    public string VersionLabel => $"v{Version}";

    /// <summary>The GitHub link, null if the server sent something that isn't a URL.</summary>
    public Uri? RepoUri => Uri.TryCreate(RepoUrl, UriKind.Absolute, out var url) ? url : null;

    /// <summary>The "Report an issue" link.</summary>
    public Uri? IssuesUri => Uri.TryCreate(IssuesUrl, UriKind.Absolute, out var url) ? url : null;
}

/// <summary><c>GET /changelog</c>: one release, newest first. The website shows "Release v0.22.0" with "Latest" on the first.</summary>
public sealed record ChangelogEntry
{
    public required string Version { get; init; }

    /// <summary>The release day; the contract always sends one, so a blank fails the response.</summary>
    public required DateOnly Date { get; init; }

    public required IReadOnlyList<string> Changes { get; init; }

    /// <summary>"Release v0.22.0", the row's heading.</summary>
    public string Label => $"Release v{Version}";

    /// <summary>"Today", "1 day ago", "12 days ago": the row's age, as of now.</summary>
    public string DaysAgo() => DaysAgo(DateTimeOffset.UtcNow);

    /// <summary>
    /// Port of changelog-list.tsx's <c>daysAgo</c>: whole days since the
    /// release day at UTC midnight (what <c>new Date("2026-09-17")</c> is in
    /// the browser), never negative, so a release dated tomorrow by a server
    /// in another time zone still reads "Today".
    /// </summary>
    public string DaysAgo(DateTimeOffset now)
    {
        var released = new DateTimeOffset(Date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
        var days = Math.Max(0, (int)Math.Floor((now - released).TotalDays));
        return days switch
        {
            0 => "Today",
            1 => "1 day ago",
            _ => $"{days.ToString(CultureInfo.InvariantCulture)} days ago",
        };
    }
}
