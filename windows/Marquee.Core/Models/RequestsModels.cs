namespace Marquee.Core.Models;

// Requests (api-v1.md section 7): a member's own list, the admin's review
// queue and history. The rejection reason fields arrive with server 0.28.0;
// they are read leniently (missing key = null / empty list) so an older
// server's answers still decode.

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

    public TitleId TitleId => new(MediaType, TmdbId);
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
