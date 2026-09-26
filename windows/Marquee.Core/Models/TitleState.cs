namespace Marquee.Core.Models;

/// <summary>
/// The button a poster card offers on hover (components/poster-card.tsx's
/// quick-action slot, the Mac's <c>PosterQuickAction</c>).
/// </summary>
public enum PosterQuickAction
{
    None,

    /// <summary>Admin "+ Add to Radarr/Sonarr" (<c>POST /titles/{type}/{id}/add</c>).</summary>
    Add,

    /// <summary>Member "Request" (<c>POST /titles/{type}/{id}/request</c>).</summary>
    Request,

    /// <summary>The "Requested" pill: this viewer already has a request in.</summary>
    Requested,
}

public static class PosterQuickActions
{
    /// <summary>
    /// Which quick action a card offers: the admin's add wins, then a
    /// member's request, which reads "Requested" once one is in (api-v1.md
    /// <c>TitleCard</c>: <c>canRequest</c> unless <c>requested</c>).
    /// </summary>
    public static PosterQuickAction QuickAction(this TitleCard card)
    {
        if (card.CanQuickAdd)
        {
            return PosterQuickAction.Add;
        }
        if (card.Requested == true)
        {
            return PosterQuickAction.Requested;
        }
        return card.CanRequest ? PosterQuickAction.Request : PosterQuickAction.None;
    }

    /// <summary>"+ Add to Radarr" / "+ Add to Sonarr", like the website's QuickAddButton.</summary>
    public static string AddLabel(MediaType mediaType) =>
        mediaType == MediaType.Tv ? "+ Add to Sonarr" : "+ Add to Radarr";
}

/// <summary>
/// What this PC has changed about one title since the lists showing it were
/// fetched. Null fields leave the card's own value alone.
/// </summary>
public sealed record TitleStateChange
{
    /// <summary>The library status the server reported right after the change.</summary>
    public LibraryStatus? Status { get; init; }

    /// <summary>Whether a quick-add is still on offer (false once it's in Radarr/Sonarr).</summary>
    public bool? CanQuickAdd { get; init; }

    /// <summary>Whether this viewer has a request in for it.</summary>
    public bool? Requested { get; init; }
}

/// <summary>
/// The Mac's <c>TitleStateStore</c>: lists deliberately don't refetch when
/// the viewer acts on them (that reloads the page under the pointer), so a
/// quick add or a request records its outcome here and every poster card
/// built afterwards folds it in, which keeps a card that was just added from
/// offering "+ Add" again. Session-scoped: a reload, signing out or changing
/// server clears it, and the server's own data is authoritative again.
///
/// Thread-safe; <see cref="Changed"/> is raised on the thread that recorded
/// the change.
/// </summary>
public sealed class TitleStateStore
{
    private readonly object gate = new();
    private readonly Dictionary<TitleId, TitleStateChange> changes = [];

    /// <summary>A title's recorded change moved; the argument is the merged change.</summary>
    public event EventHandler<TitleStateChangedEventArgs>? Changed;

    public TitleStateChange? this[TitleId id]
    {
        get
        {
            lock (gate)
            {
                return changes.GetValueOrDefault(id);
            }
        }
    }

    /// <summary>Quick add succeeded: it's in Radarr/Sonarr, so the button goes and the badge shows what the server reports.</summary>
    public TitleStateChange Added(TitleId id, LibraryStatus? status) =>
        Merge(id, change => change with
        {
            CanQuickAdd = false,
            Requested = null,
            Status = status ?? change.Status,
        });

    /// <summary>A member's request went in.</summary>
    public TitleStateChange Requested(TitleId id) =>
        Merge(id, change => change with { Requested = true, CanQuickAdd = false });

    /// <summary>A title's status was re-read (the title page after an action or a refresh).</summary>
    public TitleStateChange StatusChanged(TitleId id, LibraryStatus status, bool alreadyRequested)
    {
        return Merge(id, change => change with
        {
            Status = status,
            Requested = alreadyRequested ? true : change.Requested,
            // Anything the library tracks or owns has nothing left to add.
            CanQuickAdd = status == LibraryStatus.Untracked || status == LibraryStatus.ComingSoon ? change.CanQuickAdd : false,
        });
    }

    public void Clear()
    {
        lock (gate)
        {
            changes.Clear();
        }
    }

    private TitleStateChange Merge(TitleId id, Func<TitleStateChange, TitleStateChange> edit)
    {
        TitleStateChange merged;
        lock (gate)
        {
            merged = edit(changes.GetValueOrDefault(id) ?? new TitleStateChange());
            changes[id] = merged;
        }
        Changed?.Invoke(this, new TitleStateChangedEventArgs(id, merged));
        return merged;
    }
}

public sealed class TitleStateChangedEventArgs(TitleId id, TitleStateChange change) : EventArgs
{
    public TitleId Id { get; } = id;
    public TitleStateChange Change { get; } = change;
}

public static class TitleStateExtensions
{
    /// <summary>The card as it should be drawn, with anything this PC changed since the list was fetched folded in.</summary>
    public static TitleCard Applying(this TitleCard card, TitleStateChange? change)
    {
        if (change == null)
        {
            return card;
        }
        return card with
        {
            Status = change.Status ?? card.Status,
            CanQuickAdd = change.CanQuickAdd ?? card.CanQuickAdd,
            Requested = change.Requested ?? card.Requested,
        };
    }
}
