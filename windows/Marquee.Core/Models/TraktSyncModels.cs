namespace Marquee.Core.Models;

// "Trakt lists" on Settings › Account (api-v1.md section 11, 0.49+): keep a
// public Trakt watchlist or list in sync, so new titles on it are requested
// as you every few hours (the trakt-sync job). An older server answers 404
// and the card stays hidden.

/// <summary>A sync's <c>kind</c>: someone's watchlist, or one of their public lists.</summary>
public readonly record struct TraktSyncKind(string Value) : IOpenEnum<TraktSyncKind>
{
    public static readonly TraktSyncKind Watchlist = new("watchlist");
    public static readonly TraktSyncKind List = new("list");

    public static IReadOnlyList<TraktSyncKind> Known { get; } = [Watchlist, List];
    public static TraktSyncKind FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;
}

/// <summary>Whose sync it is: <c>{id, username, displayName}</c>.</summary>
public sealed record TraktSyncOwner
{
    public required Guid Id { get; init; }
    public required string Username { get; init; }
    public string? DisplayName { get; init; }

    /// <summary>The display name, else the username.</summary>
    public string Label => DisplayName.NonBlank() ?? Username;
}

/// <summary>One kept-in-sync Trakt list (<c>GET /trakt-syncs</c>, and the answer of every change to one).</summary>
public sealed record TraktSync
{
    public required Guid Id { get; init; }
    public required TraktSyncKind Kind { get; init; }

    /// <summary>The list's link on trakt.tv.</summary>
    public required string Url { get; init; }

    /// <summary>"someone's watchlist", or the list's name from its link.</summary>
    public required string Name { get; init; }

    public required bool Movies { get; init; }
    public required bool Tv { get; init; }

    /// <summary>The last successful check; null before the first.</summary>
    public DateTimeOffset? LastSyncedAt { get; init; }

    /// <summary>Why the last check failed ("Couldn't read that list from Trakt…"), or why titles wait (a request limit).</summary>
    public string? LastError { get; init; }

    /// <summary>Titles requested from this list so far.</summary>
    public int RequestedCount { get; init; }

    public required DateTimeOffset CreatedAt { get; init; }
    public required TraktSyncOwner Owner { get; init; }

    /// <summary>
    /// The line under the switches, like the Plex Watchlist's: "Checked 5m
    /// ago · 3 titles requested so far", or "Not checked yet" before the first check.
    /// </summary>
    public string Summary(DateTimeOffset now)
    {
        var checkedText = LastSyncedAt is { } synced
            ? $"Checked {NotificationItem.TimeAgoLabel(synced, now)}"
            : "Not checked yet";
        return RequestedCount > 0
            ? $"{checkedText} · {RequestedCount} {(RequestedCount == 1 ? "title" : "titles")} requested so far"
            : checkedText;
    }
}

/// <summary><c>GET /trakt-syncs</c>: your syncs (the admin's <c>?all=true</c>: everyone's).</summary>
public sealed record TraktSyncs
{
    public required IReadOnlyList<TraktSync> Results { get; init; }

    /// <summary>Trakt is connected (Settings › Integrations): syncs can be added, and the ones there run.</summary>
    public required bool Available { get; init; }

    /// <summary>The most one account may keep in sync (10).</summary>
    public required int MaxPerMember { get; init; }
}

/// <summary>
/// <c>POST /trakt-syncs</c> body. <see cref="RequestExisting"/> false (the
/// default) requests only what's added to the list from now on.
/// </summary>
public sealed record NewTraktSyncRequest(string Url, bool? Movies = null, bool? Tv = null, bool? RequestExisting = null);

/// <summary><c>PATCH /trakt-syncs/{id}</c> body: only the kinds being changed (null is left out).</summary>
public sealed record TraktSyncTypesRequest(bool? Movies, bool? Tv);

/// <summary>The Trakt lists card's words, the same on every app. Pure.</summary>
public static class TraktSyncLabels
{
    public const string Description =
        "Keep a public Trakt watchlist or list in sync: new movies and shows on it are requested for you every few hours.";

    /// <summary>Shown instead of the add form while <see cref="TraktSyncs.Available"/> is false.</summary>
    public const string UnavailableMessage =
        "Trakt isn't connected. The admin can connect it in Settings → Integrations.";

    /// <summary>The add form's blank-link message, shown without asking the server.</summary>
    public const string BlankLinkMessage =
        "Paste a public Trakt list or watchlist link, like https://trakt.tv/users/someone/watchlist.";

    /// <summary>Both switches off: the server's own words for it.</summary>
    public const string NoKindsMessage = "Pick movies, TV shows or both.";

    public const string EmptyText = "No Trakt lists yet.";

    public const string RequestExistingLabel = "Also request what's on it now";

    /// <summary>
    /// The add form's body, or the message to show instead: a blank link or
    /// both kinds off are refused here, without asking the server.
    /// </summary>
    public static (NewTraktSyncRequest? Request, string? Error) AddRequest(string? url, bool movies, bool tv, bool requestExisting)
    {
        if (url.NonBlank()?.Trim() is not { } link)
        {
            return (null, BlankLinkMessage);
        }
        if (!movies && !tv)
        {
            return (null, NoKindsMessage);
        }
        return (new NewTraktSyncRequest(link, movies, tv, requestExisting), null);
    }

    /// <summary>"Requests as Anna" for a list that isn't yours (the admin's view of everyone's); null for your own.</summary>
    public static string? OwnerLine(TraktSync sync, Guid? viewerId) =>
        viewerId is { } me && sync.Owner.Id == me ? null : $"Requests as {sync.Owner.Label}";
}
