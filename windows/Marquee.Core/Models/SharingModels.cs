using System.Globalization;
using System.Text.RegularExpressions;

namespace Marquee.Core.Models;

// "Share" on a title (api-v1.md "Share a title", 0.45.1+): send it to someone
// else in the household, who gets a title_shared notification, or share a
// link outside Marquee. The form's rules and the outside links follow
// lib/sharing/parse.ts and components/share-button.tsx.

/// <summary>
/// Someone a share can go to (<c>GET /users/shareable</c>), and who a
/// <c>title_shared</c> notification came from (its <c>sharedBy</c>): a
/// <see cref="RequestPerson"/> plus <c>avatarUrl</c>.
/// </summary>
public sealed record ShareableUser
{
    public required Guid UserId { get; init; }
    public string? DisplayName { get; init; }
    public required string Username { get; init; }

    /// <summary>What the website prints: display name, else username.</summary>
    public required string Label { get; init; }

    /// <summary>The server-relative photo path; null for initials.</summary>
    public string? AvatarUrl { get; init; }
}

/// <summary><c>GET /users/shareable</c>: every account but your own, by name.</summary>
public sealed record ShareableUsersResponse
{
    /// <summary>Empty: "No one else has an account here yet."</summary>
    public required IReadOnlyList<ShareableUser> Results { get; init; }

    /// <summary>
    /// Marquee's public address (no trailing slash), for the Marquee link;
    /// null when none is set, and then the link uses the address this app
    /// is connected to.
    /// </summary>
    public string? PublicUrl { get; init; }
}

/// <summary>
/// <c>POST /titles/{type}/{tmdbId}/share</c>: one to 20 account ids and an
/// optional note (up to 280 characters), left out of the body when null.
/// </summary>
public sealed record ShareTitleBody(IReadOnlyList<Guid> UserIds, string? Note = null);

/// <summary><c>{ "ok": true, "sharedWith": 1 }</c>.</summary>
public sealed record ShareTitleResponse
{
    public bool Ok { get; init; }

    /// <summary>How many people it went to (repeats dropped).</summary>
    public required int SharedWith { get; init; }
}

/// <summary>Which link "Share a link" hands out.</summary>
public enum ShareLinkKind
{
    /// <summary>The title on this Marquee: they'll need to sign in.</summary>
    Marquee,

    /// <summary>TMDb's public page: anyone can open it.</summary>
    Tmdb,

    /// <summary>IMDb's page, when the title has an IMDb id.</summary>
    Imdb,
}

/// <summary>One choice in "Share a link": its words, the link, and the text that goes with it.</summary>
public sealed record ShareLinkOption(ShareLinkKind Kind, string Label, Uri Url, string Text)
{
    public override string ToString() => Label;
}

/// <summary>
/// The Share dialog without its controls: the outside links, the send
/// form's checks, and what it says afterwards.
/// </summary>
public static partial class TitleShareForm
{
    /// <summary>A note's longest, in characters (an emoji counts once).</summary>
    public const int MaxNoteLength = 280;

    /// <summary>People one share can go to at once.</summary>
    public const int MaxRecipients = 20;

    public const string PickSomeoneMessage = "Pick who to share it with.";
    public const string NoteTooLongMessage = "Keep the note under 280 characters.";
    public const string NoOneElseMessage = "No one else has an account here yet.";

    /// <summary>A share's NotFound: an id that isn't an account any more (the transport keeps no server text for a 404).</summary>
    public const string RecipientGoneMessage = "Someone you picked isn't in this household any more.";

    /// <summary><c>GET /users/shareable</c>'s NotFound: a server from before 0.45.</summary>
    public const string OlderServerMessage = "Sending to someone here needs a newer Marquee server.";

    [GeneratedRegex("^tt[0-9]+$")]
    private static partial Regex ImdbIdPattern();

    /// <summary>
    /// The title on Marquee: <paramref name="publicUrl"/> when it is an
    /// http(s) address, else <paramref name="server"/> (the address this app
    /// is connected to), then <c>/title/{type}/{tmdbId}</c>. Null with
    /// neither.
    /// </summary>
    public static Uri? MarqueeUrl(TitleId title, string? publicUrl, Uri? server)
    {
        var path = $"/title/{Uri.EscapeDataString(title.MediaType.Value)}/{title.TmdbId.ToString(CultureInfo.InvariantCulture)}";
        foreach (var candidate in new[] { publicUrl.NonBlank()?.Trim(), server?.GetLeftPart(UriPartial.Path) })
        {
            if (candidate == null
                || !Uri.TryCreate(candidate, UriKind.Absolute, out var root)
                || (root.Scheme != Uri.UriSchemeHttps && root.Scheme != Uri.UriSchemeHttp))
            {
                continue;
            }
            if (Uri.TryCreate(candidate.TrimEnd('/') + path, UriKind.Absolute, out var url))
            {
                return url;
            }
        }
        return null;
    }

    /// <summary><c>https://www.themoviedb.org/{type}/{tmdbId}</c>, for someone without an account.</summary>
    public static Uri TmdbUrl(TitleId title) =>
        new($"https://www.themoviedb.org/{Uri.EscapeDataString(title.MediaType.Value)}/{title.TmdbId.ToString(CultureInfo.InvariantCulture)}");

    /// <summary><c>https://www.imdb.com/title/{imdbId}/</c>; null without an id (or one that isn't <c>tt…</c>).</summary>
    public static Uri? ImdbUrl(string? imdbId) =>
        imdbId.NonBlank()?.Trim() is { } id && ImdbIdPattern().IsMatch(id) ? new Uri($"https://www.imdb.com/title/{id}/") : null;

    /// <summary>
    /// "Share a link"'s choices in the website's order: Marquee (when there's
    /// an address for it), TMDb, then IMDb when the title has an id. The
    /// Marquee link travels as "Ice Age on Marquee", the others as the name.
    /// </summary>
    public static IReadOnlyList<ShareLinkOption> LinkOptions(TitleId title, string name, string? imdbId, string? publicUrl, Uri? server)
    {
        var options = new List<ShareLinkOption>();
        if (MarqueeUrl(title, publicUrl, server) is { } marquee)
        {
            options.Add(new ShareLinkOption(ShareLinkKind.Marquee, "Marquee — they'll need to sign in", marquee, $"{name} on Marquee"));
        }
        options.Add(new ShareLinkOption(ShareLinkKind.Tmdb, "TMDb — anyone can open it", TmdbUrl(title), name));
        if (ImdbUrl(imdbId) is { } imdb)
        {
            options.Add(new ShareLinkOption(ShareLinkKind.Imdb, "IMDb — anyone can open it", imdb, name));
        }
        return options;
    }

    /// <summary>The note's length as the server counts it: characters, an emoji once.</summary>
    public static int NoteLength(string? note) => (note ?? "").EnumerateRunes().Count();

    /// <summary>"250/280" once the note is within 40 of the limit; null before that.</summary>
    public static string? NoteCounter(string? note)
    {
        var length = NoteLength(note);
        return length > MaxNoteLength - 40
            ? $"{length.ToString(CultureInfo.CurrentCulture)}/{MaxNoteLength.ToString(CultureInfo.CurrentCulture)}"
            : null;
    }

    /// <summary>
    /// The body to send, or the message to show instead: "Pick who to share
    /// it with." with nobody picked, "Share with at most 20 people at a
    /// time." past the limit, "Keep the note under 280 characters." for a
    /// long note. Repeats are dropped; a blank note is left out. The server
    /// cleans the note (tags, line breaks) itself.
    /// </summary>
    public static (ShareTitleBody? Body, string? Error) Build(IEnumerable<Guid> picked, string? note)
    {
        var userIds = picked.Distinct().ToList();
        if (userIds.Count == 0)
        {
            return (null, PickSomeoneMessage);
        }
        if (userIds.Count > MaxRecipients)
        {
            return (null, $"Share with at most {MaxRecipients.ToString(CultureInfo.CurrentCulture)} people at a time.");
        }
        var text = note.NonBlank()?.Trim();
        if (NoteLength(text) > MaxNoteLength)
        {
            return (null, NoteTooLongMessage);
        }
        return (new ShareTitleBody(userIds, text), null);
    }

    /// <summary>
    /// What shows once it's sent: "Sent to Kid." for one person (by the
    /// name picked), else "Sent to 3 people." with the server's count.
    /// </summary>
    public static string SentMessage(IReadOnlyList<string> pickedLabels, int sharedWith) =>
        pickedLabels.Count == 1
            ? $"Sent to {pickedLabels[0]}."
            : $"Sent to {sharedWith.ToString(CultureInfo.CurrentCulture)} people.";
}
