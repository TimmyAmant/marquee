namespace Marquee.Core.Models;

// "Request from my Plex Watchlist" (Settings > Account, under Linked
// accounts; app/settings/plex-watchlist.tsx on the website).

/// <summary>
/// <c>GET /me/plex-watchlist</c> and every other <c>/me/plex-watchlist</c>
/// answer: whether it can be turned on (Plex is linked), whether it's on,
/// which kinds it requests, and how the last check went.
/// </summary>
public sealed record PlexWatchlist
{
    /// <summary>What an older server without the feature (404) stands for: nothing to show.</summary>
    public static readonly PlexWatchlist Unavailable = new() { Available = false, Enabled = false, Movies = true, Tv = true };

    /// <summary>Plex is linked to this account, so it can be turned on.</summary>
    public required bool Available { get; init; }

    public required bool Enabled { get; init; }
    public required bool Movies { get; init; }
    public required bool Tv { get; init; }

    /// <summary>The last successful check; null before the first.</summary>
    public DateTimeOffset? LastSyncedAt { get; init; }

    /// <summary>Why the last check failed, or why it switched itself off (then <see cref="Enabled"/> is false).</summary>
    public string? LastError { get; init; }

    /// <summary>Titles requested from the watchlist so far.</summary>
    public int RequestedCount { get; init; }

    /// <summary>
    /// The website's line under the switches: "Checked 5m ago · 3 titles
    /// requested so far", or "Checking your watchlist…" before the first check.
    /// </summary>
    public string Summary(DateTimeOffset now)
    {
        var checkedText = LastSyncedAt is { } synced
            ? $"Checked {NotificationItem.TimeAgoLabel(synced, now)}"
            : "Checking your watchlist…";
        return RequestedCount > 0
            ? $"{checkedText} · {RequestedCount} {(RequestedCount == 1 ? "title" : "titles")} requested so far"
            : checkedText;
    }
}

/// <summary><c>POST /me/plex-watchlist/poll</c> body.</summary>
public sealed record PlexWatchlistPollRequest(string Handle);

/// <summary><c>PATCH /me/plex-watchlist</c> body: only the kinds being changed (null is left out).</summary>
public sealed record PlexWatchlistTypesRequest(bool? Movies, bool? Tv);
