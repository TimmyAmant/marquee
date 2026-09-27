using System.ComponentModel;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// app/discover/page.tsx: curated shelves, all from <c>GET /discover</c>,
/// rendered as horizontal rails. Reloads on F5, when the library changed on
/// the server (a sync finished) and when integrations changed (TMDb was
/// just connected), but not after this PC's own actions: acting on a title
/// must not re-render, and re-scroll, the page you acted on.
/// </summary>
public sealed partial class DiscoverViewModel : ObservableObject
{
    private readonly AppModel model;
    private CancellationTokenSource? loadCancellation;
    private bool active;

    /// <summary>
    /// Which server and account the shelves were fetched for. The frame
    /// caches this page across sign-outs, so a different account must not
    /// see the previous one's Recently Added for even a moment.
    /// </summary>
    private string? loadedFor;

    /// <summary>The spinner: only while nothing has been shown yet, so a reload keeps the shelves up.</summary>
    [ObservableProperty]
    private bool isLoading;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasShelves))]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    private IReadOnlyList<ShelfViewModel>? shelves;

    /// <summary>The last failure's user-facing message; shown alone when there are no shelves to keep.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    private string? errorMessage;

    /// <summary>Loaded, and every shelf came back empty.</summary>
    [ObservableProperty]
    private bool isEmpty;

    /// <summary>The server has no TMDb credential (deviation 7): the "Connect TMDb" state instead of an error.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(TmdbMissingMessage))]
    [NotifyPropertyChangedFor(nameof(CanOpenSettings))]
    private bool isTmdbMissing;

    public DiscoverViewModel(AppModel model)
    {
        this.model = model;
    }

    public bool HasShelves => Shelves is { Count: > 0 };
    public bool HasError => ErrorMessage != null;
    public bool ShowsError => HasError && !HasShelves;

    private bool IsAdmin => model.Viewer?.IsAdmin == true;

    public string TmdbMissingMessage => IsAdmin
        ? Loc.Get("Discover_TmdbMissingAdmin")
        : Loc.Get("Discover_TmdbMissingMember");

    /// <summary>Only an admin can fix a missing TMDb credential.</summary>
    public bool CanOpenSettings => IsTmdbMissing && IsAdmin;

    // MARK: Lifecycle

    /// <summary>
    /// The page is on screen: follow reloads and fetch. A forward navigation
    /// (<paramref name="refresh"/>) refetches behind the shelves already
    /// showing, like the Mac's <c>.task</c> when Discover is re-selected;
    /// coming back from a title does not.
    /// </summary>
    public void Activate(bool refresh)
    {
        if (active)
        {
            return;
        }
        active = true;
        model.PropertyChanged += OnModelPropertyChanged;
        model.Events.Changed += OnServerChanged;
        if (loadedFor != CurrentIdentity)
        {
            Shelves = null;
            IsEmpty = false;
            IsTmdbMissing = false;
            ErrorMessage = null;
        }
        if (Shelves == null || refresh)
        {
            _ = LoadAsync();
        }
    }

    private string CurrentIdentity => $"{model.Session.Server?.BaseUrlString}|{model.Viewer?.Id}";

    /// <summary>The page left the screen: stop following, and drop an in-flight fetch.</summary>
    public void Deactivate()
    {
        if (!active)
        {
            return;
        }
        active = false;
        model.PropertyChanged -= OnModelPropertyChanged;
        model.Events.Changed -= OnServerChanged;
        loadCancellation?.Cancel();
    }

    // MARK: Loading

    /// <summary>Fetches the shelves; also "Try again" on the error state.</summary>
    [RelayCommand]
    private async Task LoadAsync()
    {
        loadCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        loadCancellation = cancellation;
        var token = cancellation.Token;

        IsLoading = Shelves == null;
        ErrorMessage = null;
        try
        {
            var fresh = await model.Api.Discover.ShelvesAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            Apply(fresh);
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            if (error.IsTmdbUnconfigured())
            {
                Shelves = null;
                IsEmpty = false;
                IsTmdbMissing = true;
            }
            else
            {
                ErrorMessage = error.Message;
            }
        }
        catch (OperationCanceledException)
        {
            return;
        }
        finally
        {
            if (!token.IsCancellationRequested)
            {
                IsLoading = false;
            }
        }
    }

    private void Apply(DiscoverShelves fresh)
    {
        var built = BuildShelves(fresh);
        loadedFor = CurrentIdentity;
        IsTmdbMissing = false;
        IsEmpty = built.Count == 0;
        Shelves = built.Count == 0 ? null : built;
    }

    /// <summary>
    /// The rows <see cref="DiscoverRows.Resolve"/> names: the admin's order
    /// from <c>shelves</c> (0.49+), their own rows included, or an older
    /// server's fixed keys in page order; empty ones are left out, as the
    /// website hides them. Each gets the "See all" the server names
    /// (lib/discover/lists.ts), or an older server's two grid links.
    /// </summary>
    private List<ShelfViewModel> BuildShelves(DiscoverShelves response)
    {
        var list = new List<ShelfViewModel>();
        foreach (var row in DiscoverRows.Resolve(response))
        {
            ICommand? seeAll = row.SeeAll is { } target ? new RelayCommand(() => model.OpenSeeAll(target)) : null;
            switch (row)
            {
                case DiscoverRow.Posters posters:
                    // Every Discover row carries the MOVIE/SERIES pill, like the web page.
                    var items = posters.Cards.Select(card => new PosterItem(model, card, OpenTitleCommand, showsTypeLabel: true)).ToList();
                    list.Add(ShelfViewModel.OfPosters(row.Title, items, seeAll));
                    break;
                case DiscoverRow.Genres genres:
                    var mediaType = genres.MediaType;
                    list.Add(ShelfViewModel.OfChips(
                        row.Title,
                        genres.Tiles.Tiles().Select(tile => new ChipItem(tile, new RelayCommand(() => model.Browse(mediaType, genreId: tile.Id)))).ToList(),
                        seeAll));
                    break;
                case DiscoverRow.Studios studios:
                    list.Add(ShelfViewModel.OfChips(
                        row.Title,
                        studios.Logos.Select(studio => new ChipItem(studio.Tile(), new RelayCommand(() => model.OpenCompany(studio.TmdbId)))).ToList(),
                        seeAll));
                    break;
                case DiscoverRow.Networks networks:
                    list.Add(ShelfViewModel.OfChips(
                        row.Title,
                        networks.Logos.Select(network => new ChipItem(network.Tile(), new RelayCommand(() => model.Browse(MediaType.Tv, networkId: network.TmdbId)))).ToList(),
                        seeAll));
                    break;
            }
        }
        return list;
    }

    // MARK: Actions

    [RelayCommand]
    private void OpenTitle(PosterItem? item)
    {
        if (item != null)
        {
            model.OpenTitle(item.Id);
        }
    }

    [RelayCommand]
    private void OpenSettings() => model.OpenSettings(SettingsTab.Integrations);

    // MARK: Reload triggers

    private void OnModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(AppModel.ReloadToken))
        {
            _ = LoadAsync();
        }
        else if (e.PropertyName == nameof(AppModel.Viewer))
        {
            OnPropertyChanged(nameof(TmdbMissingMessage));
            OnPropertyChanged(nameof(CanOpenSettings));
        }
    }

    /// <summary>Raised on the thread that completed a request, so the reload is queued onto the UI thread.</summary>
    private void OnServerChanged(object? sender, ServerChangedEventArgs e)
    {
        var libraryMovedOnServer = e.Source == ServerChangeSource.Server && e.Change.HasFlag(ServerChange.Library);
        var integrationsChanged = e.Change.HasFlag(ServerChange.Integrations);
        if (!libraryMovedOnServer && !integrationsChanged)
        {
            return;
        }
        model.Dispatcher.TryEnqueue(() =>
        {
            if (active)
            {
                _ = LoadAsync();
            }
        });
    }
}
