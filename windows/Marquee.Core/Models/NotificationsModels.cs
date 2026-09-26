namespace Marquee.Core.Models;

// Notifications (api-v1.md section 8): the bell's dropdown. The event type
// is the open NotificationEventType in OpenEnum.cs, so a kind a newer server
// adds still lists (with the generic bell emoji) instead of failing the call.

/// <summary><c>GET /notifications</c>: the bell's dropdown, newest first.</summary>
public sealed record NotificationList
{
    public required int UnreadCount { get; init; }

    /// <summary>Empty: "No notifications yet."</summary>
    public required IReadOnlyList<NotificationItem> Results { get; init; }
}

public sealed record NotificationItem
{
    public required Guid Id { get; init; }
    public required MediaType MediaType { get; init; }
    public required int TmdbId { get; init; }
    public required string Title { get; init; }

    /// <summary>
    /// <c>grabbed</c> (started downloading), <c>downloaded</c> (finished),
    /// <c>request_approved</c>, <c>request_rejected</c>, <c>issue_reported</c>,
    /// <c>issue_resolved</c>, <c>title_shared</c>; <c>Emoji</c> gives
    /// the website's glyph for each.
    /// </summary>
    public required NotificationEventType EventType { get; init; }

    /// <summary>e.g. <c>"The Matrix" was declined.</c></summary>
    public required string Message { get; init; }

    public required bool Read { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }

    /// <summary>
    /// Who shared the title, on a <c>title_shared</c> one (0.45+): the row
    /// leads with their photo, else initials. Null on every other kind, once
    /// that account is removed, and from an older server (no key).
    /// </summary>
    public ShareableUser? SharedBy { get; init; }

    /// <summary>The sharer's note, shown in quotes under the message; null without one (and on other kinds).</summary>
    public string? Note { get; init; }

    /// <summary>Clicking one opens this title and marks it read.</summary>
    public TitleId TitleId => new(MediaType, TmdbId);

    /// <summary>"just now", "5m ago", "3h ago", "2d ago": the website's relative time, against <paramref name="now"/>.</summary>
    public string TimeAgo(DateTimeOffset now) => TimeAgoLabel(CreatedAt, now);

    /// <inheritdoc cref="TimeAgo(DateTimeOffset)"/>
    public string TimeAgo() => TimeAgo(DateTimeOffset.UtcNow);

    /// <summary>
    /// The website's wording, coarsest unit that fits. A timestamp in the
    /// future (clock skew between phone and server) reads as "just now"
    /// rather than a negative count.
    /// </summary>
    public static string TimeAgoLabel(DateTimeOffset createdAt, DateTimeOffset now)
    {
        var seconds = (long)(now - createdAt).TotalSeconds;
        if (seconds < 60)
        {
            return "just now";
        }
        var minutes = seconds / 60;
        if (minutes < 60)
        {
            return $"{minutes}m ago";
        }
        var hours = minutes / 60;
        if (hours < 24)
        {
            return $"{hours}h ago";
        }
        return $"{hours / 24}d ago";
    }
}
