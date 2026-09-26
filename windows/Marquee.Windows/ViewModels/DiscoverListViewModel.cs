using System.Collections.ObjectModel;
using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// app/discover/[list]/page.tsx: a Discover shelf's "See all" (Recently
/// Added, Trending, Upcoming Movies, Upcoming Series) as a poster grid,
/// paged from <c>GET /discover/lists/{list}</c> as it scrolls. The same
/// paging as <see cref="BrowseViewModel"/>: pages append to
/// <see cref="Cards"/>, repeats are skipped, and a later page failing
/// pauses paging behind a Retry row instead of replacing the cards shown.
/// </summary>
public sealed partial class DiscoverListViewModel : ObservableObject
{
    public const string EmptyTitle = "Nothing here right now";

    /// <summary>A run of pages that were all repeats: keep asking, bounded, so scrolling never dead-ends.</summary>
    private const int MaxEmptyBatches = 5;

    private readonly AppModel model;
    private CancellationTokenSource? loadCancellation;
    private int generation;
    private int nextPage = 1;
    private bool active;
    private readonly HashSet<TitleId> seen = [];

    /// <summary>The server's heading once page 1 is in; the list's own name until then.</summary>
    [ObservableProperty]
    private string title = "";

    /// <summary>The spinner: only until the first answer of a reset.</summary>
    [ObservableProperty]
    private bool isLoading;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsLoadMoreButton))]
    private bool isLoadingPage;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsLoadMore))]
    [NotifyPropertyChangedFor(nameof(ShowsLoadMoreButton))]
    private bool hasNextPage;

    /// <summary>A later page failed; paging waits for Retry.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasPageError))]
    [NotifyPropertyChangedFor(nameof(ShowsLoadMoreButton))]
    private string? pageError;

    /// <summary>The first page failed; shown alone, with "Try again".</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    private string? errorMessage;

    [ObservableProperty]
    private bool isEmpty;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(TmdbMissingMessage))]
    [NotifyPropertyChangedFor(nameof(CanOpenSettings))]
    private bool isTmdbMissing;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    private bool hasCards;

    public DiscoverListViewModel(AppModel model)
    {
        this.model = model;
        Cards.CollectionChanged += (_, _) => HasCards = Cards.Count > 0;
    }

    /// <summary>The list this page shows; <see cref="Activate"/> says which.</summary>
    public DiscoverListKind List { get; private set; } = DiscoverListKind.Trending;

    public ObservableCollection<PosterItem> Cards { get; } = [];

    public string LoadingLabel => $"Loading {Title}…";
    public string ErrorTitle => $"Couldn't load {Title}";

    /// <summary>The website's empty line: the library for Recently Added, TMDb for the rest.</summary>
    public string EmptyMessage => List == DiscoverListKind.RecentlyAdded
        ? "Nothing added to your Plex or Jellyfin library yet."
        : "Nothing here right now — TMDb didn't send anything back.";

    public bool ShowsError => ErrorMessage != null && !HasCards;
    public bool HasPageError => PageError != null;

    /// <summary>The footer under the grid: Load more, Loading more, or Retry.</summary>
    public bool ShowsLoadMore => HasNextPage;

    /// <summary>The plain "Load more" button: more pages, nothing in flight, nothing failed.</summary>
    public bool ShowsLoadMoreButton => HasNextPage && !IsLoadingPage && PageError == null;

    private bool IsAdmin => model.Viewer?.IsAdmin == true;

    public string TmdbMissingMessage => IsAdmin
        ? "Every poster, search result, and title page comes from TMDb. Add a free API key or read access token in Settings → Integrations."
        : "The household admin hasn't connected TMDb yet.";

    public bool CanOpenSettings => IsTmdbMissing && IsAdmin;

    partial void OnTitleChanged(string value)
    {
        OnPropertyChanged(nameof(LoadingLabel));
        OnPropertyChanged(nameof(ErrorTitle));
    }

    // MARK: Lifecycle

    /// <summary>The page is on screen for <paramref name="list"/>: follow reloads and fetch from page 1.</summary>
    public void Activate(DiscoverListKind list)
    {
        if (active && list == List)
        {
            return;
        }
        if (active)
        {
            Deactivate();
        }
        List = list;
        Title = list.Title;
        OnPropertyChanged(nameof(EmptyMessage));
        active = true;
        model.PropertyChanged += OnModelPropertyChanged;
        model.Events.Changed += OnServerChanged;
        _ = ResetAsync();
    }

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

    /// <summary>Starts over from page 1. Also "Try again".</summary>
    [RelayCommand]
    private async Task ResetAsync()
    {
        // Every reset starts a new generation; anything still in flight from
        // an older one discards its results instead of appending them.
        generation++;
        var current = generation;
        loadCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        loadCancellation = cancellation;

        IsLoading = true;
        Cards.Clear();
        seen.Clear();
        nextPage = 1;
        HasNextPage = true;
        IsLoadingPage = false;
        ErrorMessage = null;
        PageError = null;
        IsEmpty = false;
        IsTmdbMissing = false;

        await LoadNextPageAsync(retrying: false, cancellation.Token);
        if (current == generation)
        {
            IsLoading = false;
            IsEmpty = Cards.Count == 0 && ErrorMessage == null && !IsTmdbMissing;
        }
    }

    /// <summary>The grid scrolled near its end, or "Load more".</summary>
    [RelayCommand]
    private Task LoadMoreAsync() => LoadNextPageAsync(retrying: false, loadCancellation?.Token ?? CancellationToken.None);

    /// <summary>The Retry row after a later page failed.</summary>
    [RelayCommand]
    private Task RetryPageAsync() => LoadNextPageAsync(retrying: true, loadCancellation?.Token ?? CancellationToken.None);

    /// <summary>Called by the page as the grid scrolls; a paused (failed) page waits for Retry.</summary>
    public void LoadMoreIfScrolled()
    {
        if (HasNextPage && !IsLoadingPage && PageError == null && !IsLoading)
        {
            _ = LoadMoreAsync();
        }
    }

    /// <summary>
    /// Appends the next page. After a failure only an explicit retry asks
    /// again; the cards already loaded (and the scroll offset) stay put.
    /// </summary>
    private async Task LoadNextPageAsync(bool retrying, CancellationToken token)
    {
        if (!HasNextPage || IsLoadingPage || (!retrying && PageError != null))
        {
            return;
        }
        var current = generation;
        var list = List;
        IsLoadingPage = true;
        try
        {
            var attempts = 0;
            var appended = 0;
            do
            {
                DiscoverListResults page;
                try
                {
                    page = await model.Api.Discover.ListPageAsync(list, nextPage, token);
                }
                catch (ApiException error)
                {
                    if (current != generation || error.IsCancellation)
                    {
                        return;
                    }
                    PageFailed(error);
                    return;
                }
                if (current != generation)
                {
                    return;
                }
                if (page.Title.Length > 0)
                {
                    Title = page.Title;
                }
                // Rankings shift between requests: drop repeats.
                foreach (var card in page.Results)
                {
                    if (seen.Add(card.Id))
                    {
                        Cards.Add(new PosterItem(model, card, OpenTitleCommand, showsTypeLabel: list.MixesMediaTypes));
                        appended++;
                    }
                }
                HasNextPage = page.HasMorePages;
                nextPage = page.Page + 1;
                ErrorMessage = null;
                PageError = null;
                attempts++;
            }
            while (appended == 0 && HasNextPage && attempts < MaxEmptyBatches);
        }
        finally
        {
            if (current == generation)
            {
                IsLoadingPage = false;
            }
        }
    }

    /// <summary>
    /// The first page failing is the page's error (or the "Connect TMDb"
    /// state); a later one only pauses paging behind the Retry row.
    /// </summary>
    private void PageFailed(ApiException error)
    {
        if (Cards.Count > 0)
        {
            PageError = error.Message;
        }
        else if (error.IsTmdbUnconfigured())
        {
            IsTmdbMissing = true;
            HasNextPage = false;
        }
        else
        {
            ErrorMessage = error.Message;
        }
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
            _ = ResetAsync();
        }
        else if (e.PropertyName == nameof(AppModel.Viewer))
        {
            OnPropertyChanged(nameof(TmdbMissingMessage));
            OnPropertyChanged(nameof(CanOpenSettings));
        }
    }

    /// <summary>
    /// The library moving on the server (a sync finished) or an integration
    /// changing (TMDb connected) starts over; this app's own actions don't,
    /// so acting on a title never throws the grid back to the top.
    /// </summary>
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
                _ = ResetAsync();
            }
        });
    }
}
