namespace Marquee.Core.Models;

// Problem reports (api-v1.md section 7, "Problem reports (0.38+)"). An
// older server has no /issues at all and leaves the title's canReport /
// openReports and the badges' openIssues out, which read as "no reports":
// the app then shows none of this.

/// <summary>What's wrong with a title (<c>kind</c>); lib/issues/labels.ts has the words.</summary>
public readonly record struct IssueKind(string Value) : IOpenEnum<IssueKind>
{
    public static readonly IssueKind Video = new("video");
    public static readonly IssueKind Audio = new("audio");
    public static readonly IssueKind Subtitles = new("subtitles");
    public static readonly IssueKind WontPlay = new("wont_play");
    public static readonly IssueKind WrongTitle = new("wrong_title");
    public static readonly IssueKind Other = new("other");

    /// <summary>The Report dialog's order.</summary>
    public static IReadOnlyList<IssueKind> Known { get; } = [Video, Audio, Subtitles, WontPlay, WrongTitle, Other];
    public static IssueKind FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    /// <summary>"Bad video quality", "Audio problem", …; the server's <c>kindLabel</c> wins where there is one.</summary>
    public string Label
    {
        get
        {
            if (this == Video) return "Bad video quality";
            if (this == Audio) return "Audio problem";
            if (this == Subtitles) return "Subtitles missing or wrong";
            if (this == WontPlay) return "Won't play";
            if (this == WrongTitle) return "Wrong movie or episode";
            if (this == Other) return "Something else";
            return OpenEnum.Capitalized(Value);
        }
    }
}

public readonly record struct IssueStatus(string Value) : IOpenEnum<IssueStatus>
{
    public static readonly IssueStatus Open = new("open");
    public static readonly IssueStatus Resolved = new("resolved");

    public static IReadOnlyList<IssueStatus> Known { get; } = [Open, Resolved];
    public static IssueStatus FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;
}

/// <summary>Who reported a problem. The same shape as <see cref="RequestPerson"/>, with the id kept as text.</summary>
public sealed record IssueReporter
{
    public string? UserId { get; init; }
    public string? DisplayName { get; init; }
    public required string Username { get; init; }

    /// <summary>What the website prints: display name, else username.</summary>
    public required string Label { get; init; }
}

/// <summary>One problem report (<c>GET /issues</c>).</summary>
public sealed record Issue
{
    public required Guid Id { get; init; }
    public required MediaType MediaType { get; init; }
    public required int TmdbId { get; init; }
    public required string Title { get; init; }
    public ImageRef? PosterPath { get; init; }
    public int? SeasonNumber { get; init; }
    public int? EpisodeNumber { get; init; }

    /// <summary>"S2 E5", "Season 2", "Specials", or null.</summary>
    public string? EpisodeLabel { get; init; }

    public required IssueKind Kind { get; init; }

    /// <summary>The kind in words, e.g. "Audio problem".</summary>
    public required string KindLabel { get; init; }

    public string? Message { get; init; }
    public required IssueStatus Status { get; init; }

    /// <summary>The admin's note when marking it fixed.</summary>
    public string? Resolution { get; init; }

    public required IssueReporter ReportedBy { get; init; }

    /// <summary>Reported by the viewer, who may withdraw it while it's open.</summary>
    public bool IsMine { get; init; }

    public required DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset? ResolvedAt { get; init; }

    public bool IsOpen => Status == IssueStatus.Open;
    public bool IsResolved => Status == IssueStatus.Resolved;

    /// <summary>The server's label, else this app's words for the kind.</summary>
    public string KindText => KindLabel.NonBlank() ?? Kind.Label;

    /// <summary>"Fixed: Replaced the file", or "Fixed" without a note; empty while open.</summary>
    public string FixedLine => IsResolved ? (Resolution.NonBlank() is { } note ? $"Fixed: {note}" : "Fixed") : "";

    public TitleId TitleId => new(MediaType, TmdbId);
}

/// <summary>One of the kinds the Report form offers.</summary>
public sealed record IssueKindOption
{
    public required IssueKind Id { get; init; }
    public required string Label { get; init; }
}

/// <summary>
/// <c>GET /issues</c>: the admin's open reports (newest first) then the 30
/// most recently fixed; a member's own (up to 100).
/// </summary>
public sealed record IssuesResponse
{
    public required IReadOnlyList<Issue> Results { get; init; }

    /// <summary>The kinds, in the form's order; empty when left out.</summary>
    public IReadOnlyList<IssueKindOption> Kinds { get; init; } = [];

    public IReadOnlyList<Issue> Open => Results.Where(issue => issue.IsOpen).ToList();
    public IReadOnlyList<Issue> Fixed => Results.Where(issue => issue.IsResolved).ToList();
}

/// <summary>
/// <c>POST /titles/{type}/{tmdbId}/issues</c>. <c>Message</c> up to 1000
/// characters (required for <see cref="IssueKind.Other"/>); the season and
/// episode are TV only, and an episode needs its season. Null fields are
/// left out of the body.
/// </summary>
public sealed record ReportIssueBody(IssueKind Kind, string? Message = null, int? SeasonNumber = null, int? EpisodeNumber = null);

/// <summary>A choice in the Report dialog's "Season (optional)" picker; a null season is the whole show.</summary>
public sealed record IssueSeasonChoice(int? SeasonNumber, string Label)
{
    public override string ToString() => Label;
}

/// <summary>
/// components/report-problem-button.tsx's form, without the controls: the
/// season picker's choices and turning what was filled in into the body
/// (or the website's own message for what the server would refuse anyway).
/// </summary>
public static class IssueReportForm
{
    public const int MaxMessageLength = 1000;

    /// <summary>"Whole show", then "Specials" / "Season N" for each season in the given order.</summary>
    public static IReadOnlyList<IssueSeasonChoice> SeasonChoices(IEnumerable<int> seasonNumbers) =>
        new[] { new IssueSeasonChoice(null, "Whole show") }
            .Concat(seasonNumbers.Distinct().Select(number =>
                new IssueSeasonChoice(number, number == 0 ? "Specials" : $"Season {number.ToString(System.Globalization.CultureInfo.CurrentCulture)}")))
            .ToList();

    /// <summary>The note's label: "What's wrong?" for Something else, where it's required.</summary>
    public static string MessageHeader(IssueKind? kind) => kind == IssueKind.Other ? "What's wrong?" : "Anything else? (optional)";

    /// <summary>
    /// The body to send, or the message to show instead: "Pick what's
    /// wrong." without a kind, "Say what's wrong." for Something else
    /// without a note, "Season and episode are whole numbers." for an
    /// episode that isn't one. The episode only goes with a season, and
    /// neither goes for a movie.
    /// </summary>
    public static (ReportIssueBody? Body, string? Error) Build(IssueKind? kind, string? message, bool isTv, int? seasonNumber, string? episodeText)
    {
        if (kind is not { } picked)
        {
            return (null, "Pick what's wrong.");
        }
        var note = message.NonBlank()?.Trim();
        if (picked == IssueKind.Other && note == null)
        {
            return (null, "Say what's wrong.");
        }
        if (note is { Length: > MaxMessageLength })
        {
            return (null, "Keep it under 1000 characters.");
        }
        int? season = isTv ? seasonNumber : null;
        int? episode = null;
        if (season != null && episodeText.NonBlank() is { } text)
        {
            if (!int.TryParse(text.Trim(), System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var number) || number < 1)
            {
                return (null, "Season and episode are whole numbers.");
            }
            episode = number;
        }
        return (new ReportIssueBody(picked, note, season, episode), null);
    }
}

/// <summary><c>{ "ok": true, "issueId": "…" }</c>.</summary>
public sealed record ReportIssueResult
{
    public required bool Ok { get; init; }
    public required Guid IssueId { get; init; }
}

/// <summary><c>POST /issues/{id}/resolve</c> body; the call sends none without a note.</summary>
public sealed record ResolveIssueBody(string Note);
