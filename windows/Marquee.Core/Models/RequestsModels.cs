using System.Globalization;

namespace Marquee.Core.Models;

// Requests (api-v1.md section 7): a member's own list, the admin's review
// queue and history. The rejection reason fields arrive with server 0.28.0;
// they are read leniently (missing key = null / empty list) so an older
// server's answers still decode.

/// <summary>lib/requests/labels.ts, for when the server didn't send its own label.</summary>
public static class SeasonLabels
{
    /// <summary>
    /// Null for null (the whole series) or an empty list; <c>[2]</c> → "Season 2",
    /// <c>[1,2,3,5,7,8]</c> → "Seasons 1–3, 5, 7–8", <c>[0]</c> → "Specials",
    /// <c>[0,1]</c> → "Specials, Season 1".
    /// </summary>
    public static string? SeasonsLabel(IEnumerable<int>? seasons)
    {
        if (seasons == null)
        {
            return null;
        }
        var sorted = seasons.Distinct().Order().ToList();
        if (sorted.Count == 0)
        {
            return null;
        }
        var parts = new List<string>();
        if (sorted.Contains(0))
        {
            parts.Add("Specials");
        }
        var numbered = sorted.Where(season => season != 0).ToList();
        if (numbered.Count > 0)
        {
            var runs = new List<string>();
            var start = numbered[0];
            var end = start;
            void Close() => runs.Add(start == end
                ? start.ToString(CultureInfo.InvariantCulture)
                : $"{start.ToString(CultureInfo.InvariantCulture)}–{end.ToString(CultureInfo.InvariantCulture)}");
            foreach (var number in numbered.Skip(1))
            {
                if (number == end + 1)
                {
                    end = number;
                }
                else
                {
                    Close();
                    start = number;
                    end = number;
                }
            }
            Close();
            parts.Add((numbered.Count == 1 ? "Season " : "Seasons ") + string.Join(", ", runs));
        }
        return string.Join(", ", parts);
    }

    /// <summary>
    /// components/request-title.tsx's second line: the seasons label and "In
    /// 4K" joined with " · ", each left out when absent; empty for neither.
    /// </summary>
    public static string RequestLine(string? seasonsText, bool is4k) =>
        string.Join(" · ", new[] { seasonsText.NonBlank(), is4k ? "In 4K" : null }.OfType<string>());
}

/// <summary>Who requested (or acted on) something.</summary>
public sealed record RequestPerson
{
    /// <summary>Null where the underlying query doesn't carry it.</summary>
    public Guid? UserId { get; init; }

    public string? DisplayName { get; init; }
    public required string Username { get; init; }

    /// <summary>What the website prints: display name, else username.</summary>
    public required string Label { get; init; }
}

/// <summary><c>GET /requests/mine</c>: your own requests, newest first.</summary>
public sealed record MyRequest
{
    public required Guid Id { get; init; }
    public required MediaType MediaType { get; init; }
    public required int TmdbId { get; init; }
    public required string Title { get; init; }
    public ImageRef? PosterPath { get; init; }
    public required RequestStatus Status { get; init; }
    public required bool ManuallyApproved { get; init; }

    /// <summary>Live for approved requests only (null otherwise).</summary>
    public LibraryStatus? LibraryStatus { get; init; }

    /// <summary>
    /// "Pending review", "Declined", "In your library", "Downloading",
    /// "Coming soon", "Manually approved" or "Approved".
    /// </summary>
    public required string StatusLabel { get; init; }

    public required RequestTone StatusTone { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset? ReviewedAt { get; init; }

    /// <summary>
    /// Why the admin declined it (server 0.28.0 and later); null when
    /// approved, still pending, declined without a reason, or from an older
    /// server that doesn't send the key.
    /// </summary>
    public string? RejectionReason { get; init; }

    /// <summary>The requested seasons (TV); null for a whole series, a movie, or a server older than season requests.</summary>
    public IReadOnlyList<int>? Seasons { get; init; }

    /// <summary>"Seasons 1–3"; null when <see cref="Seasons"/> is.</summary>
    public string? SeasonsLabel { get; init; }

    /// <summary>What the requests screens print under the title: the server's label, else one made here; empty for none.</summary>
    public string SeasonsText => SeasonsLabel.NonBlank() ?? SeasonLabels.SeasonsLabel(Seasons) ?? "";

    /// <summary>Asked for in 4K (0.37+; an older server omits it, meaning false).</summary>
    public bool Is4k { get; init; }

    /// <summary>The second line under the title: "Season 2 · In 4K", "In 4K", "Season 2", or empty.</summary>
    public string DetailText => SeasonLabels.RequestLine(SeasonsText, Is4k);

    public TitleId TitleId => new(MediaType, TmdbId);
}

/// <summary>
/// <c>GET /requests/pending</c>: the admin's review queue. Empty: "No pending
/// requests." The website shows "Approve all" only when more than one is
/// pending.
/// </summary>
public sealed record PendingRequests
{
    /// <summary>The admin's Sonarr base URL (null if not connected), for "Add manually in Sonarr".</summary>
    public string? SonarrUrl { get; init; }

    /// <summary>Newest first.</summary>
    public required IReadOnlyList<PendingRequest> Results { get; init; }

    /// <summary>
    /// The household's saved reasons to offer when declining (server 0.28.0
    /// and later). An older server omits the key, so this defaults to empty
    /// instead of being required.
    /// </summary>
    public IReadOnlyList<string> RejectionReasons { get; init; } = [];

    /// <summary>
    /// <c>{sonarrUrl}/add/new?term={title}</c>: offered when approving a TV
    /// request fails with "Couldn't resolve this show for Sonarr." Null
    /// without a Sonarr connection.
    /// </summary>
    public Uri? ManualSonarrAddUrl(PendingRequest request)
    {
        if (SonarrUrl.NonBlank() is not { } baseUrl)
        {
            return null;
        }
        // encodeURIComponent semantics, as the website: EscapeDataString
        // turns a space into %20 and a literal "+" into %2B, so Sonarr never
        // reads a "+" in a title as a space.
        var url = baseUrl.TrimEnd('/') + "/add/new?term=" + Uri.EscapeDataString(request.Title);
        return Uri.TryCreate(url, UriKind.Absolute, out var result) ? result : null;
    }
}

public sealed record PendingRequest
{
    public required Guid Id { get; init; }
    public required MediaType MediaType { get; init; }
    public required int TmdbId { get; init; }
    public required string Title { get; init; }
    public ImageRef? PosterPath { get; init; }
    public required RequestPerson RequestedBy { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }

    /// <summary>The requested seasons (TV); null for a whole series, a movie, or a server older than season requests.</summary>
    public IReadOnlyList<int>? Seasons { get; init; }

    /// <summary>"Seasons 1–3"; null when <see cref="Seasons"/> is.</summary>
    public string? SeasonsLabel { get; init; }

    /// <summary>What the requests screens print under the title: the server's label, else one made here; empty for none.</summary>
    public string SeasonsText => SeasonsLabel.NonBlank() ?? SeasonLabels.SeasonsLabel(Seasons) ?? "";

    /// <summary>Asked for in 4K (0.37+; an older server omits it, meaning false).</summary>
    public bool Is4k { get; init; }

    /// <summary>The second line under the title: "Season 2 · In 4K", "In 4K", "Season 2", or empty.</summary>
    public string DetailText => SeasonLabels.RequestLine(SeasonsText, Is4k);

    public TitleId TitleId => new(MediaType, TmdbId);
}

/// <summary><c>GET /requests/history</c>: "Past requests", the 50 most recently reviewed.</summary>
public sealed record ReviewedRequest
{
    public required Guid Id { get; init; }
    public required MediaType MediaType { get; init; }
    public required int TmdbId { get; init; }
    public required string Title { get; init; }
    public ImageRef? PosterPath { get; init; }
    public required RequestStatus Status { get; init; }
    public required bool ManuallyApproved { get; init; }

    /// <summary>"Approved", "Manually approved" or "Rejected".</summary>
    public required string StatusLabel { get; init; }

    /// <summary><c>UserId</c> is always null here.</summary>
    public required RequestPerson RequestedBy { get; init; }

    public required DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset? ReviewedAt { get; init; }

    /// <summary>The reason given when it was declined (server 0.28.0 and later); null otherwise, or from an older server.</summary>
    public string? RejectionReason { get; init; }

    /// <summary>The requested seasons (TV); null for a whole series, a movie, or a server older than season requests.</summary>
    public IReadOnlyList<int>? Seasons { get; init; }

    /// <summary>"Seasons 1–3"; null when <see cref="Seasons"/> is.</summary>
    public string? SeasonsLabel { get; init; }

    /// <summary>What the requests screens print under the title: the server's label, else one made here; empty for none.</summary>
    public string SeasonsText => SeasonsLabel.NonBlank() ?? SeasonLabels.SeasonsLabel(Seasons) ?? "";

    /// <summary>Asked for in 4K (0.37+; an older server omits it, meaning false).</summary>
    public bool Is4k { get; init; }

    /// <summary>The second line under the title: "Season 2 · In 4K", "In 4K", "Season 2", or empty.</summary>
    public string DetailText => SeasonLabels.RequestLine(SeasonsText, Is4k);

    /// <summary>
    /// Where an approved request was added and with what (0.43+). Null for
    /// rejected and manually approved requests, anything approved before
    /// 0.43, and from an older server.
    /// </summary>
    public AddedTo? AddedTo { get; init; }

    /// <summary>"Added to Radarr 2" under the badge; null when unknown or that server was removed.</summary>
    public string? AddedToLine => AddedTo?.ServerName.NonBlank() is { } name ? $"Added to {name}" : null;

    public TitleId TitleId => new(MediaType, TmdbId);
}

/// <summary><c>addedTo</c> on a past request (0.43+): the server and the settings it was added with.</summary>
public sealed record AddedTo
{
    public string? ServerId { get; init; }

    /// <summary>Null once that server has been removed.</summary>
    public string? ServerName { get; init; }

    public int? QualityProfileId { get; init; }
    public string? RootFolderPath { get; init; }
    public IReadOnlyList<int> Tags { get; init; } = [];
    public SeriesType? SeriesType { get; init; }
}

/// <summary><c>POST /requests/approve-all</c>.</summary>
public sealed record ApproveAllResult
{
    public required bool Ok { get; init; }
    public required int ApprovedCount { get; init; }
    public required int FailedCount { get; init; }

    /// <summary>"1 request(s) couldn't be approved.", null when nothing failed.</summary>
    public string? Message { get; init; }
}

/// <summary><c>POST /requests/{id}/reject</c> body (server 0.28.0 and later); the call sends no body without a reason.</summary>
public sealed record RejectRequest(string Reason);

// MARK: Request limits (0.39+)

/// <summary>
/// <c>requestLimits</c> on <c>/me</c>: each null when that type isn't
/// limited (always for the admin and trusted members).
/// </summary>
public sealed record RequestLimits
{
    public RequestLimit? Movie { get; init; }
    public RequestLimit? Tv { get; init; }

    /// <summary>
    /// app/requests/page.tsx: the member's line above their requests,
    /// "Movies: 3 of 5 requests left (every 7 days) · TV: none left until
    /// Oct 3"; null when neither type is limited. <paramref name="zone"/>
    /// is for the date, local time by default.
    /// </summary>
    public string? Summary(TimeZoneInfo? zone = null)
    {
        var lines = new List<string>(2);
        if (Movie is { } movie)
        {
            lines.Add(movie.Line("Movies", zone));
        }
        if (Tv is { } tv)
        {
            lines.Add(tv.Line("TV", zone));
        }
        return lines.Count > 0 ? string.Join(" · ", lines) : null;
    }
}

/// <summary>One type's limit: at most <see cref="Limit"/> requests in any <see cref="Days"/> days.</summary>
public sealed record RequestLimit
{
    public required int Limit { get; init; }
    public required int Days { get; init; }

    /// <summary>Requests counted in the window (every one that wasn't declined, 4K and Watchlist included).</summary>
    public required int Used { get; init; }

    public required int Remaining { get; init; }

    /// <summary>While none is left: when the oldest counted request ages out.</summary>
    public DateTimeOffset? NextSlotAt { get; init; }

    /// <summary>quotaLine: "Movies: 3 of 5 requests left (every 7 days)" / "Movies: none left until Oct 3".</summary>
    public string Line(string label, TimeZoneInfo? zone = null)
    {
        if (Remaining > 0)
        {
            return string.Create(CultureInfo.InvariantCulture, $"{label}: {Remaining} of {Limit} requests left (every {Days} days)");
        }
        if (NextSlotAt is not { } next)
        {
            return $"{label}: none left";
        }
        var local = TimeZoneInfo.ConvertTime(next, zone ?? TimeZoneInfo.Local);
        return $"{label}: none left until {local.ToString("MMM d", CultureInfo.InvariantCulture)}";
    }
}
