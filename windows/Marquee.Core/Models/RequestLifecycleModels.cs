using System.Globalization;
using System.Text.Json.Nodes;

namespace Marquee.Core.Models;

// The request lifecycle (api-v1.md deviation 16, 0.46+): changing or
// cancelling a pending request, "Couldn't add" and Retry, and the viewer's
// own requests on the title page. components/request-lifecycle.tsx and
// components/my-title-requests.tsx have the words. An older server sends none
// of the new fields (they read as false / null / 0 / empty) and answers 404 on
// the new endpoints, so nothing here shows.

/// <summary>The words the lifecycle controls share.</summary>
public static class RequestLifecycle
{
    /// <summary>Under an approved request, which can't be edited or cancelled any more.</summary>
    public const string AskInCommentsHint = "Need a change? Ask in its comments.";

    /// <summary>The note on a review-queue row whose seasons or 4K changed after it was asked.</summary>
    public const string ChangedSinceAsking = "Changed since asking";

    public const string EditLabel = "Edit";
    public const string EditLoadingLabel = "Loading…";
    public const string CancelLabel = "Cancel request";
    public const string CancelQuestion = "Cancel it?";
    public const string ConfirmCancelLabel = "Yes, cancel";
    public const string CancellingLabel = "Cancelling…";
    public const string KeepLabel = "Keep it";
    public const string RetryLabel = "Retry";
    public const string RetryingLabel = "Retrying…";
    public const string AddedByHandLabel = "Added it by hand";
    public const string AddedByHandTooltip = "Mark it approved without Sonarr/Radarr — once you've got it some other way.";
}

/// <summary>
/// <c>PATCH /requests/{id}</c>'s body. Each field is optional and an absent
/// one is left unchanged, so <see cref="Seasons"/> goes on the wire only when
/// <see cref="ChangesSeasons"/>: then a list asks for just those seasons and
/// null for the whole series (<c>"seasons": null</c>, which is not the same
/// as leaving the key out).
/// </summary>
public sealed record RequestEdit
{
    private RequestEdit()
    {
    }

    /// <summary>The body carries <c>seasons</c> (a list, or null for the whole series).</summary>
    public bool ChangesSeasons { get; private init; }

    /// <summary>With <see cref="ChangesSeasons"/>: the seasons to ask for, ascending, or null for the whole series.</summary>
    public IReadOnlyList<int>? Seasons { get; private init; }

    /// <summary>The 4K copy (true) or the regular one (false); null leaves it as it is.</summary>
    public bool? Is4k { get; private init; }

    /// <summary>TV: just <paramref name="seasons"/> (sorted, without repeats), and optionally the 4K flag.</summary>
    public static RequestEdit JustSeasons(IEnumerable<int> seasons, bool? is4k = null) =>
        new() { ChangesSeasons = true, Seasons = seasons.Distinct().Order().ToList(), Is4k = is4k };

    /// <summary>TV: the whole series (<c>"seasons": null</c>), and optionally the 4K flag.</summary>
    public static RequestEdit WholeSeries(bool? is4k = null) =>
        new() { ChangesSeasons = true, Seasons = null, Is4k = is4k };

    /// <summary>Only the 4K flag; the seasons (and a movie's lack of them) stay as they are.</summary>
    public static RequestEdit FourK(bool is4k) => new() { Is4k = is4k };

    /// <summary>The JSON body: <c>seasons</c> only when it changes (null included), <c>is4k</c> only when set.</summary>
    public JsonObject ToJson()
    {
        var body = new JsonObject();
        if (ChangesSeasons)
        {
            body["seasons"] = Seasons == null ? null : new JsonArray(Seasons.Select(season => (JsonNode?)JsonValue.Create(season)).ToArray());
        }
        if (Is4k is { } fourK)
        {
            body["is4k"] = fourK;
        }
        return body;
    }
}

/// <summary>Why a season in the edit picker has (or hasn't) a checkbox.</summary>
public readonly record struct EditSeasonState(string Value) : IOpenEnum<EditSeasonState>
{
    public static readonly EditSeasonState Requestable = new("requestable");
    public static readonly EditSeasonState Complete = new("complete");
    public static readonly EditSeasonState Monitored = new("monitored");
    public static readonly EditSeasonState Requested = new("requested");
    public static readonly EditSeasonState Unavailable = new("unavailable");

    public static IReadOnlyList<EditSeasonState> Known { get; } = [Requestable, Complete, Monitored, Requested, Unavailable];
    public static EditSeasonState FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    /// <summary>The title page's picker state for the same row: a checkbox, "In library", "Monitored", "Requested", or nothing.</summary>
    public SeasonRequestState PickerState
    {
        get
        {
            if (this == Requestable) return SeasonRequestState.Requestable;
            if (this == Complete) return SeasonRequestState.InLibrary;
            if (this == Monitored) return SeasonRequestState.Monitored;
            if (this == Requested) return SeasonRequestState.Requested;
            return SeasonRequestState.Unavailable;
        }
    }
}

/// <summary>A season row of <c>GET /requests/{id}/edit-options</c>.</summary>
public sealed record RequestEditSeasonRow
{
    public required int SeasonNumber { get; init; }
    public required string Name { get; init; }
    public required int EpisodeCount { get; init; }
    public required EditSeasonState State { get; init; }
}

/// <summary>
/// <c>GET /requests/{id}/edit-options</c> (0.46+): what "Edit" can offer —
/// the request as it is now, the show's seasons newest first (this request's
/// own ticked), and whether "In 4K" is set up.
/// </summary>
public sealed record RequestEditOptions
{
    public required Guid RequestId { get; init; }
    public required MediaType MediaType { get; init; }
    public required string Title { get; init; }

    /// <summary>As it is now: null is the whole series (and every movie).</summary>
    public IReadOnlyList<int>? Seasons { get; init; }

    public bool Is4k { get; init; }

    /// <summary>TV: newest first. Empty for a movie.</summary>
    public IReadOnlyList<RequestEditSeasonRow> SeasonRows { get; init; } = [];

    /// <summary>"In 4K" can be offered: the 4K Sonarr/Radarr is set up.</summary>
    public bool FourKAvailable { get; init; }

    public bool IsTv => MediaType == MediaType.Tv;

    /// <summary>A movie without 4K has nothing to change: don't offer Edit.</summary>
    public bool HasNothingToChange => !IsTv && !FourKAvailable;
}

/// <summary>
/// components/request-lifecycle.tsx's EditRequestButton, without the
/// controls: the season picker with the request's seasons ticked, "The whole
/// series" / "Just these seasons" for TV, and "In 4K" when 4K is set up (which
/// is always the whole show). <see cref="Edit"/> is what "Save changes" sends.
/// </summary>
public sealed class RequestEditForm
{
    public const string Heading = "Change request";
    public const string WholeSeriesLabel = "The whole series";
    public const string JustTheseLabel = "Just these seasons";
    public const string SaveLabel = "Save changes";
    public const string SavingLabel = "Saving…";
    public const string NothingToChangeMessage = "There's nothing to change: 4K isn't set up on this server.";

    public RequestEditForm(RequestEditOptions options)
    {
        Options = options;
        Selection = SeasonPickerSelection.Of(options.SeasonRows
            .Where(row => row.State == EditSeasonState.Requestable)
            .Select(row => row.SeasonNumber));
        foreach (var season in options.Seasons ?? [])
        {
            Selection.Set(season, true);
        }
        WholeSeries = options.Seasons == null;
        Is4k = options.Is4k;
    }

    public RequestEditOptions Options { get; }

    /// <summary>The ticked seasons.</summary>
    public SeasonPickerSelection Selection { get; }

    public bool IsTv => Options.IsTv;

    /// <summary>TV: "The whole series" rather than "Just these seasons".</summary>
    public bool WholeSeries { get; set; }

    /// <summary>"In 4K".</summary>
    public bool Is4k { get; set; }

    /// <summary>The "In 4K" checkbox shows.</summary>
    public bool OffersFourK => Options.FourKAvailable;

    /// <summary>"In 4K (always the whole show)" for TV, "In 4K" for a movie.</summary>
    public string FourKLabel => IsTv ? "In 4K (always the whole show)" : "In 4K";

    /// <summary>The whole-series / just-these choice: TV, and not while 4K (which is always the whole show) is ticked.</summary>
    public bool ScopeEnabled => IsTv && !Is4k;

    /// <summary>The season checkboxes can be changed: just these seasons of a show, in the regular copy.</summary>
    public bool ListEnabled => IsTv && !WholeSeries && !Is4k;

    /// <summary>A movie without 4K: nothing to offer.</summary>
    public bool HasNothingToChange => Options.HasNothingToChange;

    /// <summary>"Save changes" can be pressed: something to change, and a season picked when only some are asked for.</summary>
    public bool CanSave => !HasNothingToChange && (!ListEnabled || Selection.Seasons.Count > 0);

    /// <summary>
    /// The body, as the website sends it: <c>is4k</c> always, and for TV
    /// <c>seasons</c> — null for the whole series or 4K, else the ticked ones.
    /// </summary>
    public RequestEdit Edit
    {
        get
        {
            if (!IsTv)
            {
                return RequestEdit.FourK(Is4k);
            }
            return Is4k || WholeSeries ? RequestEdit.WholeSeries(Is4k) : RequestEdit.JustSeasons(Selection.Seasons, Is4k);
        }
    }

    public static string SubmitTitle(bool saving) => saving ? SavingLabel : SaveLabel;
}

/// <summary>
/// One of the viewer's own requests for a title (<c>viewer.myRequests</c>,
/// 0.46+): regular and 4K, newest first, at most five.
/// </summary>
public sealed record TitleRequestSummary
{
    public required Guid Id { get; init; }
    public required RequestStatus Status { get; init; }
    public IReadOnlyList<int>? Seasons { get; init; }
    public string? SeasonsLabel { get; init; }
    public bool Is4k { get; init; }

    /// <summary>Still pending: its requester may change its seasons or 4K…</summary>
    public bool CanEdit { get; init; }

    /// <summary>…or cancel it.</summary>
    public bool CanCancel { get; init; }

    public int CommentCount { get; init; }
    public DateTimeOffset? CreatedAt { get; init; }

    /// <summary>"Season 2 · In 4K", "In 4K", "Season 2", or empty.</summary>
    public string DetailText => SeasonLabels.RequestLine(SeasonsLabel.NonBlank() ?? SeasonLabels.SeasonsLabel(Seasons), Is4k);

    /// <summary>"waiting for review", "approved", "declined"; the raw value for one this app doesn't know.</summary>
    public string StatusWords
    {
        get
        {
            if (Status == RequestStatus.Pending) return "waiting for review";
            if (Status == RequestStatus.Approved) return "approved";
            if (Status == RequestStatus.Rejected) return "declined";
            return Status.Value;
        }
    }

    /// <summary>"Your request (Season 2) is waiting for review", "Your request is approved".</summary>
    public string Line => DetailText.Length > 0
        ? $"Your request ({DetailText}) is {StatusWords}"
        : $"Your request is {StatusWords}";

    /// <summary>The "Approved" hint applies (it can't be changed now).</summary>
    public string? ChangeHint => Status == RequestStatus.Approved ? RequestLifecycle.AskInCommentsHint : null;
}

// MARK: Conversations

/// <summary>What a thread entry is: a real comment, or a note that was already said.</summary>
public readonly record struct CommentKind(string Value) : IOpenEnum<CommentKind>
{
    public static readonly CommentKind Comment = new("comment");

    /// <summary>A problem report's own note, by the reporter.</summary>
    public static readonly CommentKind Report = new("report");

    /// <summary>The note a report was marked fixed with.</summary>
    public static readonly CommentKind Resolution = new("resolution");

    /// <summary>Why a request was declined.</summary>
    public static readonly CommentKind Declined = new("declined");

    public static IReadOnlyList<CommentKind> Known { get; } = [Comment, Report, Resolution, Declined];
    public static CommentKind FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    /// <summary>"Reported", "Marked fixed", "Declined" for the notes; null for a comment (or a kind this app doesn't know).</summary>
    public string? NoteLabel
    {
        get
        {
            if (this == Report) return "Reported";
            if (this == Resolution) return "Marked fixed";
            if (this == Declined) return "Declined";
            return null;
        }
    }
}

/// <summary>Who wrote a comment: the admin, a reviewer (a trusted member) or a member.</summary>
public readonly record struct CommentRole(string Value) : IOpenEnum<CommentRole>
{
    public static readonly CommentRole Admin = new("admin");
    public static readonly CommentRole Reviewer = new("reviewer");
    public static readonly CommentRole Member = new("member");

    public static IReadOnlyList<CommentRole> Known { get; } = [Admin, Reviewer, Member];
    public static CommentRole FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    /// <summary>"Admin" or "Reviewer" next to the name; null for a member (or a role this app doesn't know).</summary>
    public string? Tag
    {
        get
        {
            if (this == Admin) return "Admin";
            if (this == Reviewer) return "Reviewer";
            return null;
        }
    }
}

/// <summary>A comment's author. <see cref="Role"/> is null, and the label "Someone", once the account is gone.</summary>
public sealed record CommentAuthor
{
    public string? UserId { get; init; }
    public required string Label { get; init; }

    /// <summary>The server-relative photo path; null without one.</summary>
    public string? AvatarUrl { get; init; }

    public CommentRole? Role { get; init; }
}

/// <summary>One entry of a request's or problem report's conversation (oldest first).</summary>
public sealed record Comment
{
    /// <summary>A real comment's id, or <c>report:&lt;issue id&gt;</c> and the like for a note.</summary>
    public required string Id { get; init; }

    public required CommentKind Kind { get; init; }
    public required CommentAuthor Author { get; init; }

    /// <summary>Plain text; its line breaks are kept.</summary>
    public required string Body { get; init; }

    public required DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset? EditedAt { get; init; }
    public bool IsMine { get; init; }

    /// <summary>Yours, within 15 minutes of posting.</summary>
    public bool CanEdit { get; init; }

    /// <summary>As <see cref="CanEdit"/>, or the admin at any time.</summary>
    public bool CanDelete { get; init; }

    /// <summary>When <see cref="CanEdit"/> runs out; null for the notes.</summary>
    public DateTimeOffset? EditableUntil { get; init; }

    /// <summary>A real comment, which is what the "Comments (N)" count counts.</summary>
    public bool IsComment => Kind == CommentKind.Comment;

    public bool WasEdited => EditedAt != null;

    /// <summary>
    /// The line after the name: "Reviewer · Declined · Sep 26, 3:02 AM ·
    /// edited", each part left out when it doesn't apply.
    /// <paramref name="time"/> is <see cref="CreatedAt"/> as the screen prints it.
    /// </summary>
    public string MetaLine(string time) =>
        string.Join(" · ", new[] { Author.Role?.Tag, Kind.NoteLabel, time, WasEdited ? "edited" : null }.OfType<string>());

    /// <summary>The body with Windows line breaks as plain <c>\n</c>, as the server stores it.</summary>
    public string BodyText => Body.Replace("\r\n", "\n", StringComparison.Ordinal);
}

/// <summary><c>GET /requests/{id}/comments</c> · <c>GET /issues/{id}/comments</c>.</summary>
public sealed record CommentThread
{
    /// <summary>The viewer may add to it: the requester or reporter, and the reviewers.</summary>
    public bool CanComment { get; init; }

    /// <summary>The longest comment the server takes (2000).</summary>
    public int MaxLength { get; init; } = CommentText.DefaultMaxLength;

    /// <summary>Oldest first.</summary>
    public required IReadOnlyList<Comment> Results { get; init; }

    /// <summary>The real comments, which is what "Comments (N)" counts once the thread is open.</summary>
    public int CommentCount => Results.Count(comment => comment.IsComment);
}

/// <summary><c>POST …/comments</c> and <c>PATCH …/comments/{commentId}</c> body.</summary>
public sealed record CommentBody(string Body);

/// <summary><c>POST …/comments</c>: <c>{ "ok": true, "commentId": "…" }</c>.</summary>
public sealed record AddCommentResult
{
    public required bool Ok { get; init; }
    public string? CommentId { get; init; }
}

/// <summary>Which conversation: a request's or a problem report's.</summary>
public enum CommentSubject
{
    Request,
    Issue,
}

public static class CommentSubjectExtensions
{
    /// <summary>The path's first segment: <c>requests</c> or <c>issues</c>.</summary>
    public static string PathSegment(this CommentSubject subject) => subject == CommentSubject.Issue ? "issues" : "requests";
}

/// <summary>components/comment-thread.tsx's words and its draft rules.</summary>
public static class CommentText
{
    public const int DefaultMaxLength = 2000;
    public const string Placeholder = "Write a comment";
    public const string Send = "Send";
    public const string Sending = "Sending…";
    public const string Save = "Save";
    public const string Saving = "Saving…";
    public const string Empty = "No comments yet.";
    public const string Loading = "Loading…";
    public const string LoadFailed = "Couldn't load the conversation.";
    public const string WriteSomethingFirst = "Write something first.";

    /// <summary>"Comment" with none yet, "Comments (2)", and "Hide comments" while open.</summary>
    public static string ToggleLabel(int count, bool open)
    {
        if (open)
        {
            return "Hide comments";
        }
        return count == 0 ? "Comment" : $"Comments ({count.ToString(CultureInfo.CurrentCulture)})";
    }

    /// <summary>"12 left" once fewer than 200 characters remain; empty before that.</summary>
    public static string RemainingLabel(int length, int maxLength) =>
        length > maxLength - 200 ? $"{(maxLength - length).ToString(CultureInfo.CurrentCulture)} left" : "";

    /// <summary>
    /// What would be sent: the draft trimmed, with <c>\r\n</c> (and a lone
    /// <c>\r</c>, which a Windows text box uses) as <c>\n</c>; or the
    /// website's message for what the server would refuse anyway.
    /// </summary>
    public static (string? Body, string? Error) Prepare(string? draft, int maxLength = DefaultMaxLength)
    {
        var text = (draft ?? "").Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n').Trim();
        if (text.Length == 0)
        {
            return (null, WriteSomethingFirst);
        }
        if (text.Length > maxLength)
        {
            return (null, $"Keep it under {maxLength.ToString(CultureInfo.InvariantCulture)} characters.");
        }
        return (text, null);
    }

    /// <summary>"Send" / "Save" can be pressed: there's something besides whitespace.</summary>
    public static bool HasText(string? draft) => !string.IsNullOrWhiteSpace(draft);
}
