namespace Marquee.Core.Models;

// Settings > Activity (api-v1.md section 10). The event type is the open
// ActivityEventType in OpenEnum.cs; the server pairs each with a verb, so a
// kind a newer server adds still reads as a sentence.

/// <summary><c>GET /settings/activity</c>: one of the 50 most recent request events.</summary>
public sealed record ActivityItem
{
    public required Guid Id { get; init; }

    /// <summary>
    /// <c>request_created</c> (requested), <c>request_approved</c>
    /// (approved), <c>request_rejected</c> (declined),
    /// <c>request_manually_approved</c> (manually approved).
    /// </summary>
    public required ActivityEventType EventType { get; init; }

    /// <summary>"requested", "approved", "declined", "manually approved".</summary>
    public required string Verb { get; init; }

    public required MediaType MediaType { get; init; }
    public required int TmdbId { get; init; }
    public required string Title { get; init; }

    /// <summary>Who did it; <c>UserId</c> is null here, the activity query doesn't carry it.</summary>
    public required RequestPerson Actor { get; init; }

    public required DateTimeOffset CreatedAt { get; init; }

    /// <summary>"{actor} {verb} {title}", the way the website renders a row.</summary>
    public string Sentence => $"{Actor.Label} {Verb} {Title}";

    public TitleId TitleId => new(MediaType, TmdbId);
}
