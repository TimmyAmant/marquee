using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The poster quick action (components/poster-card.tsx, the Mac's
// PosterQuickAction) and the title-state store that keeps cards honest after
// an add or a request without refetching their list (TitleStateStore.swift).

public sealed class PosterQuickActionTests
{
    private static TitleCard Card(bool canQuickAdd = false, bool canRequest = false, bool? requested = null, LibraryStatus? status = null) =>
        Fixtures.Decode<TitleCard>("title-card") with
        {
            CanQuickAdd = canQuickAdd,
            CanRequest = canRequest,
            Requested = requested,
            Status = status,
        };

    [Fact]
    public void ChoosesTheAction()
    {
        Assert.Equal(PosterQuickAction.None, Card().QuickAction());
        Assert.Equal(PosterQuickAction.Add, Card(canQuickAdd: true).QuickAction());
        Assert.Equal(PosterQuickAction.Request, Card(canRequest: true).QuickAction());
        Assert.Equal(PosterQuickAction.Request, Card(canRequest: true, requested: false).QuickAction());
        Assert.Equal(PosterQuickAction.Requested, Card(canRequest: true, requested: true).QuickAction());
        // Requested shows even where the server no longer offers a request.
        Assert.Equal(PosterQuickAction.Requested, Card(requested: true).QuickAction());
        // The admin's add wins.
        Assert.Equal(PosterQuickAction.Add, Card(canQuickAdd: true, canRequest: true, requested: true).QuickAction());
    }

    [Fact]
    public void AddLabelNamesTheArr()
    {
        Assert.Equal("+ Add to Radarr", PosterQuickActions.AddLabel(MediaType.Movie));
        Assert.Equal("+ Add to Sonarr", PosterQuickActions.AddLabel(MediaType.Tv));
    }

    [Fact]
    public void AddedRemovesTheButtonAndTakesTheStatus()
    {
        var store = new TitleStateStore();
        var card = Card(canQuickAdd: true);
        TitleStateChangedEventArgs? raised = null;
        store.Changed += (_, e) => raised = e;

        store.Added(card.Id, LibraryStatus.TrackedMonitored);

        var drawn = card.Applying(store[card.Id]);
        Assert.Equal(PosterQuickAction.None, drawn.QuickAction());
        Assert.Equal(LibraryStatus.TrackedMonitored, drawn.Status);
        Assert.Equal(card.Id, raised?.Id);
    }

    [Fact]
    public void AddedWithoutAStatusKeepsTheCardsOwn()
    {
        var store = new TitleStateStore();
        var card = Card(canQuickAdd: true, status: LibraryStatus.Untracked);

        store.Added(card.Id, null);

        Assert.Equal(LibraryStatus.Untracked, card.Applying(store[card.Id]).Status);
    }

    [Fact]
    public void RequestedTurnsRequestIntoRequested()
    {
        var store = new TitleStateStore();
        var card = Card(canRequest: true);

        store.Requested(card.Id);

        Assert.Equal(PosterQuickAction.Requested, card.Applying(store[card.Id]).QuickAction());
    }

    [Fact]
    public void StatusChangeFromTheTitlePage()
    {
        var store = new TitleStateStore();
        var card = Card(canQuickAdd: true);

        store.StatusChanged(card.Id, LibraryStatus.Untracked, alreadyRequested: false);
        Assert.Equal(PosterQuickAction.Add, card.Applying(store[card.Id]).QuickAction());

        store.StatusChanged(card.Id, LibraryStatus.TrackedDownloading, alreadyRequested: false);
        var drawn = card.Applying(store[card.Id]);
        Assert.Equal(PosterQuickAction.None, drawn.QuickAction());
        Assert.Equal(LibraryStatus.TrackedDownloading, drawn.Status);

        var member = Card(canRequest: true);
        store.StatusChanged(member.Id, LibraryStatus.Untracked, alreadyRequested: true);
        Assert.Equal(PosterQuickAction.Requested, member.Applying(store[member.Id]).QuickAction());
    }

    [Fact]
    public void UntouchedAndClearedTitlesDrawAsSent()
    {
        var store = new TitleStateStore();
        var card = Card(canQuickAdd: true);
        Assert.Same(card, card.Applying(store[card.Id]));

        store.Added(card.Id, LibraryStatus.Owned);
        store.Clear();

        Assert.Null(store[card.Id]);
        Assert.Equal(PosterQuickAction.Add, card.Applying(store[card.Id]).QuickAction());
    }
}
