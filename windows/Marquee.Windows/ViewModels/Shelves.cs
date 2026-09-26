using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using CommunityToolkit.Mvvm.Messaging;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;

namespace Marquee.Windows.ViewModels;

/// <summary>Which palette a status badge draws itself in (components/status-badge.tsx's color groups).</summary>
public enum BadgeTone
{
    Owned,
    Tracked,
    Neutral,
}

/// <summary>
/// One poster tile's worth of a <see cref="TitleCard"/>, shaped for
/// <c>PosterCard</c>'s bindings: the strings are final, the status is
/// already a tone, and the poster is an <see cref="ImageSource"/>.
///
/// The name, artwork and footer never change. The status badge and the
/// hover quick action ("+ Add", "Request", "Requested") do: they start from
/// the card with anything this PC already changed about the title folded in
/// (<see cref="AppModel.TitleState"/>), flip in place after this card's own
/// add or request, and follow the same title changed from any other card or
/// the title page. <see cref="Poster"/> is created lazily because a
/// <c>BitmapImage</c> is a UI object: it is only ever asked for by a
/// binding, on the UI thread.
///
/// Listens through <see cref="WeakReferenceMessenger"/>, so a list thrown
/// away by its page is collected without unsubscribing.
/// </summary>
public sealed partial class PosterItem : ObservableObject
{
    /// <summary>How long a failed quick action's error stays on the card.</summary>
    public static readonly TimeSpan QuickActionErrorDuration = TimeSpan.FromSeconds(5);

    private readonly AppModel model;
    private readonly TitleCard sent;
    private readonly Uri? posterUrl;
    private ImageSource? poster;
    private int errorGeneration;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(StatusLabel), nameof(Tone), nameof(IsOwnedTone), nameof(IsTrackedTone), nameof(IsNeutralTone), nameof(AccessibleName))]
    private LibraryStatus? status;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasQuickAction), nameof(IsAddAction), nameof(IsRequestAction), nameof(IsRequestedAction), nameof(AccessibleName))]
    private PosterQuickAction quickAction;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(AddButtonLabel), nameof(RequestButtonLabel))]
    private bool isQuickActionBusy;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasQuickActionError))]
    private string? quickActionError;

    /// <param name="open">Runs with this item as its parameter when the card is clicked.</param>
    /// <param name="showsTypeLabel">The "MOVIE" / "SERIES" corner pill, for rows that mix both.</param>
    public PosterItem(AppModel model, TitleCard card, ICommand? open, bool showsTypeLabel = false)
    {
        this.model = model;
        sent = card;
        Id = card.Id;
        Name = card.Name;
        Year = card.Year.NonBlank();
        Subtitle = card.Subtitle.NonBlank();
        FooterLine = card.FooterLine;
        TypeLabel = showsTypeLabel ? TypeLabelFor(card.MediaType) : null;
        AddLabel = PosterQuickActions.AddLabel(card.MediaType);
        posterUrl = card.PosterPath.Url(ImageSize.W342);
        Open = open;
        Show(card.Applying(model.TitleState[card.Id]));
        WeakReferenceMessenger.Default.Register<PosterItem, TitleStateChangedEventArgs>(
            this, static (item, message) => item.OnTitleStateChanged(message));
    }

    public TitleId Id { get; }
    public string Name { get; }
    public string? Year { get; }
    public string? Subtitle { get; }

    /// <summary>"Neo · 1999", or empty.</summary>
    public string FooterLine { get; }

    /// <summary>"MOVIE" / "SERIES", or null when the row is a single media type.</summary>
    public string? TypeLabel { get; }

    public string? StatusLabel => Status?.CompactLabel;

    public BadgeTone? Tone => Status is { } known ? ToneFor(known) : null;

    public bool IsOwnedTone => Tone == BadgeTone.Owned;
    public bool IsTrackedTone => Tone == BadgeTone.Tracked;
    public bool IsNeutralTone => Tone == BadgeTone.Neutral;

    public bool HasPoster => posterUrl != null;

    /// <summary>The w342 poster, created on first use (UI thread only).</summary>
    public ImageSource? Poster => posterUrl == null ? null : poster ??= new BitmapImage(posterUrl);

    /// <summary>What a screen reader says for the whole card: "The Matrix, 1999, Already in your library".</summary>
    public string AccessibleName => string.Join(", ", new[]
    {
        Name,
        Year,
        Status?.Label,
        QuickAction == PosterQuickAction.Requested ? "Requested" : null,
    }.OfType<string>());

    /// <summary>The click action; null makes the card inert.</summary>
    public ICommand? Open { get; }

    // MARK: Quick action

    public bool HasQuickAction => QuickAction != PosterQuickAction.None;
    public bool IsAddAction => QuickAction == PosterQuickAction.Add;
    public bool IsRequestAction => QuickAction == PosterQuickAction.Request;
    public bool IsRequestedAction => QuickAction == PosterQuickAction.Requested;
    public bool HasQuickActionError => QuickActionError != null;

    /// <summary>"+ Add to Radarr" / "+ Add to Sonarr".</summary>
    public string AddLabel { get; }

    public string AddButtonLabel => IsQuickActionBusy ? "Adding…" : AddLabel;
    public string RequestButtonLabel => IsQuickActionBusy ? "Requesting…" : "Request";

    /// <summary>The admin's "+ Add": the button goes and the badge follows the server once it's in Radarr/Sonarr.</summary>
    [RelayCommand]
    private Task QuickAddAsync() => RunQuickActionAsync(PosterQuickAction.Add, () => model.QuickAddAsync(Id));

    /// <summary>A member's "Request": the button becomes the "Requested" pill.</summary>
    [RelayCommand]
    private Task RequestAsync() => RunQuickActionAsync(PosterQuickAction.Request, () => model.RequestTitleAsync(Id));

    private async Task RunQuickActionAsync(PosterQuickAction expected, Func<Task> work)
    {
        if (IsQuickActionBusy || QuickAction != expected)
        {
            return;
        }
        IsQuickActionBusy = true;
        QuickActionError = null;
        try
        {
            await work();
            // The store already has the outcome; draw it now rather than
            // waiting for the message to come back round the dispatcher.
            Show(sent.Applying(model.TitleState[Id]));
        }
        catch (ApiException error)
        {
            _ = ShowErrorAsync(error.Message);
        }
        finally
        {
            IsQuickActionBusy = false;
        }
    }

    /// <summary>The error under the button for a few seconds, like the website's inline one.</summary>
    private async Task ShowErrorAsync(string message)
    {
        var generation = ++errorGeneration;
        QuickActionError = message;
        await Task.Delay(QuickActionErrorDuration);
        if (generation == errorGeneration)
        {
            QuickActionError = null;
        }
    }

    private void OnTitleStateChanged(TitleStateChangedEventArgs message)
    {
        if (message.Id == Id)
        {
            Show(sent.Applying(message.Change));
        }
    }

    private void Show(TitleCard card)
    {
        // A status this version of the app doesn't know renders no badge
        // rather than a raw wire value, like the Mac's StatusBadge.
        Status = card.Status is { IsKnown: true } known ? known : null;
        QuickAction = card.QuickAction();
    }

    public static string TypeLabelFor(MediaType mediaType)
    {
        if (mediaType == MediaType.Movie)
        {
            return "MOVIE";
        }
        if (mediaType == MediaType.Tv)
        {
            return "SERIES";
        }
        return mediaType.Value.ToUpperInvariant();
    }

    public static BadgeTone ToneFor(LibraryStatus status)
    {
        if (status == LibraryStatus.Owned)
        {
            return BadgeTone.Owned;
        }
        if (status == LibraryStatus.TrackedDownloading || status == LibraryStatus.TrackedMonitored)
        {
            return BadgeTone.Tracked;
        }
        return BadgeTone.Neutral;
    }
}

/// <summary>A labelled button in a rail: a genre, a studio, a network.</summary>
public sealed class ChipItem(string label, ICommand open)
{
    public string Label { get; } = label;
    public ICommand Open { get; } = open;
}

/// <summary>
/// One horizontal rail on Discover: a title and either posters or chips.
/// <c>DiscoverPage</c> shows whichever list is non-empty.
/// </summary>
public sealed class ShelfViewModel
{
    private ShelfViewModel(string title, IReadOnlyList<PosterItem> posters, IReadOnlyList<ChipItem> chips, ICommand? seeAll)
    {
        Title = title;
        Posters = posters;
        Chips = chips;
        SeeAll = seeAll;
    }

    public string Title { get; }
    public IReadOnlyList<PosterItem> Posters { get; }
    public IReadOnlyList<ChipItem> Chips { get; }

    /// <summary>"See all" in the rail header; null hides the link.</summary>
    public ICommand? SeeAll { get; }

    public bool HasPosters => Posters.Count > 0;
    public bool HasChips => Chips.Count > 0;
    public bool HasSeeAll => SeeAll != null;

    public static ShelfViewModel OfPosters(string title, IReadOnlyList<PosterItem> posters, ICommand? seeAll = null) =>
        new(title, posters, [], seeAll);

    public static ShelfViewModel OfChips(string title, IReadOnlyList<ChipItem> chips, ICommand? seeAll = null) =>
        new(title, [], chips, seeAll);
}
