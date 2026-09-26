using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Globalization;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// app/discover/discover-view.tsx: the Movies and Series grids. The filters
/// live in <see cref="AppModel.MovieFilters"/> / <see cref="AppModel.SeriesFilters"/>
/// (Discover's genre and network chips set them before opening the
/// section); this class shows them in the pickers and writes every change
/// back, then starts over from page 1.
///
/// Pages append to <see cref="Cards"/> as the grid scrolls. A later page
/// failing pauses paging behind a Retry row (so scrolling doesn't hammer
/// the server) instead of replacing the cards already shown.
/// </summary>
public sealed partial class BrowseViewModel : ObservableObject
{
    public const int FirstYear = 1950;
    public const string EmptyTitle = "Nothing left here";
    public const string EmptyMessage = "Try a different genre or year, or turn off \"Hide titles you already track\".";
    public const string AllGenres = "All genres";
    public const string AllYears = "All years";

    /// <summary>With hideOwned a whole batch can filter to nothing; keep asking, bounded, so scrolling never dead-ends.</summary>
    private const int MaxEmptyBatches = 5;

    private static readonly int CurrentYear = DateTime.Now.Year;

    private readonly AppModel model;
    private MediaType mediaType = MediaType.Movie;
    private CancellationTokenSource? loadCancellation;
    private int generation;
    private int nextPage = 1;
    private bool active;

    /// <summary>Set while the pickers are being synced from the filters, so their change events don't write back.</summary>
    private bool syncingPickers;

    private IReadOnlyList<Genre> genres = [];
    private string? networkName;
    private readonly HashSet<TitleId> seen = [];

    public ObservableCollection<PosterItem> Cards { get; } = [];

    public IReadOnlyList<string> SortOptions { get; } = BrowseSort.Known.Select(sort => sort.Label).ToList();

    /// <summary>"All years", then this year back to 1950.</summary>
    public IReadOnlyList<string> YearOptions { get; } =
        new[] { AllYears }
            .Concat(Enumerable.Range(0, CurrentYear - FirstYear + 1).Select(offset => (CurrentYear - offset).ToString(CultureInfo.InvariantCulture)))
            .ToList();

    [ObservableProperty]
    private IReadOnlyList<string> genreOptions = [AllGenres];

    [ObservableProperty]
    private int sortIndex;

    [ObservableProperty]
    private int genreIndex;

    [ObservableProperty]
    private int yearIndex;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HideOwnedLabel))]
    private bool hideOwned = true;

    /// <summary>"Netflix ✕" while a network filter is on (series only).</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasNetworkChip))]
    private string? networkChipLabel;

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

    /// <summary>The first page (or the extras) failed; shown alone when there are no cards to keep.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    [NotifyPropertyChangedFor(nameof(ShowsInlineError))]
    private string? errorMessage;

    [ObservableProperty]
    private bool isEmpty;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(TmdbMissingMessage))]
    [NotifyPropertyChangedFor(nameof(CanOpenSettings))]
    private bool isTmdbMissing;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SurpriseLabel))]
    private bool isSurprising;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSurpriseError))]
    private string? surpriseError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasBecauseYouWatched))]
    private ShelfViewModel? becauseYouWatched;

    /// <summary>Cards are present: the grid (and its footer row) draw.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    [NotifyPropertyChangedFor(nameof(ShowsInlineError))]
    private bool hasCards;

    public BrowseViewModel(AppModel model)
    {
        this.model = model;
        Cards.CollectionChanged += (_, _) => HasCards = Cards.Count > 0;
    }

    public string Title => mediaType.PluralLabel;

    public string LoadingLabel => $"Loading {mediaType.PluralLabel.ToLowerInvariant()}…";
    public string ErrorTitle => $"Couldn't load {mediaType.PluralLabel.ToLowerInvariant()}";

    public bool HasError => ErrorMessage != null;
    public bool ShowsError => HasError && !HasCards;
    public bool HasPageError => PageError != null;
    public bool HasNetworkChip => NetworkChipLabel != null;
    public bool HasSurpriseError => SurpriseError != null;
    public bool HasBecauseYouWatched => BecauseYouWatched != null;

    /// <summary>The footer under the grid: Load more, Loading more, or Retry.</summary>
    public bool ShowsLoadMore => HasNextPage;

    /// <summary>The plain "Load more" button: more pages, nothing in flight, nothing failed.</summary>
    public bool ShowsLoadMoreButton => HasNextPage && !IsLoadingPage && PageError == null;

    /// <summary>An error while cards are still showing (the extras failed): a line under the grid, not the empty state.</summary>
    public bool ShowsInlineError => HasError && HasCards;

    public string HideOwnedLabel => HideOwned ? "✓ Hiding titles you already track" : "Hide titles you already track";
    public string SurpriseLabel => IsSurprising ? "Picking…" : "🎲 Surprise me";

    private bool IsAdmin => model.Viewer?.IsAdmin == true;

    public string TmdbMissingMessage => IsAdmin
        ? "Every poster, search result, and title page comes from TMDb. Add a free API key or read access token in Settings → Integrations."
        : "The household admin hasn't connected TMDb yet.";

    public bool CanOpenSettings => IsTmdbMissing && IsAdmin;

    // MARK: Filters

    private BrowseQuery Filters => mediaType == MediaType.Movie ? model.MovieFilters : model.SeriesFilters;

    private void SetFilters(BrowseQuery filters)
    {
        if (filters == Filters)
        {
            return;
        }
        if (mediaType == MediaType.Movie)
        {
            model.MovieFilters = filters;
        }
        else
        {
            model.SeriesFilters = filters;
        }
        _ = ResetAsync();
    }

    /// <summary>The pickers follow the filters; a picker change writes back through the On*Changed hooks below.</summary>
    private void SyncPickers()
    {
        syncingPickers = true;
        try
        {
            var filters = Filters;
            var sort = BrowseSort.Known.ToList().IndexOf(filters.Sort);
            SortIndex = sort < 0 ? 0 : sort;

            var genre = filters.GenreId is { } genreId ? genres.ToList().FindIndex(candidate => candidate.Id == genreId) : -1;
            GenreIndex = genre < 0 ? 0 : genre + 1;

            YearIndex = filters.Year is { } year && year >= FirstYear && year <= CurrentYear ? CurrentYear - year + 1 : 0;
            HideOwned = filters.HideOwned;
            NetworkChipLabel = mediaType == MediaType.Tv && filters.NetworkId != null ? $"{networkName ?? "Network"} ✕" : null;
        }
        finally
        {
            syncingPickers = false;
        }
    }

    partial void OnSortIndexChanged(int value)
    {
        // A ComboBox whose items change reports -1 for a moment; that is not a choice.
        if (syncingPickers || value < 0 || value >= BrowseSort.Known.Count)
        {
            return;
        }
        SetFilters(Filters with { Sort = BrowseSort.Known[value] });
    }

    partial void OnGenreIndexChanged(int value)
    {
        if (syncingPickers || value < 0 || value > genres.Count)
        {
            return;
        }
        SetFilters(Filters with { GenreId = value == 0 ? null : genres[value - 1].Id });
    }

    partial void OnYearIndexChanged(int value)
    {
        if (syncingPickers || value < 0 || value >= YearOptions.Count)
        {
            return;
        }
        SetFilters(Filters with { Year = value == 0 ? null : CurrentYear - (value - 1) });
    }

    [RelayCommand]
    private void ToggleHideOwned() => SetFilters(Filters with { HideOwned = !Filters.HideOwned });

    [RelayCommand]
    private void ClearNetwork() => SetFilters(Filters with { NetworkId = null });

    // MARK: Lifecycle

    /// <summary>
    /// The page is on screen for <paramref name="requested"/>: follow reloads
    /// and fetch. One view model serves both sections, re-targeted here, so
    /// the page's bindings never have to be remade.
    /// </summary>
    public void Activate(MediaType requested)
    {
        if (active && requested == mediaType)
        {
            return;
        }
        if (active)
        {
            Deactivate();
        }
        mediaType = requested;
        OnPropertyChanged(nameof(Title));
        OnPropertyChanged(nameof(LoadingLabel));
        OnPropertyChanged(nameof(ErrorTitle));
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

    /// <summary>Starts over: the extras (genres, network chip, "Because you watched") and page 1. Also "Try again".</summary>
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
        var token = cancellation.Token;

        IsLoading = true;
        Cards.Clear();
        seen.Clear();
        nextPage = 1;
        HasNextPage = true;
        IsLoadingPage = false;
        ErrorMessage = null;
        PageError = null;
        SurpriseError = null;
        IsEmpty = false;
        IsTmdbMissing = false;
        BecauseYouWatched = null;
        genres = [];
        networkName = null;
        GenreOptions = [AllGenres];
        SyncPickers();

        var requested = Filters;
        try
        {
            var extras = await model.Api.Browse.ExtrasAsync(mediaType, requested, token);
            if (current != generation)
            {
                return;
            }
            genres = extras.Genres;
            networkName = extras.Network?.Name;
            GenreOptions = new[] { AllGenres }.Concat(extras.Genres.Select(genre => genre.Name)).ToList();
            SyncPickers();
            if (extras.BecauseYouWatched is { Items.Count: > 0 } watched)
            {
                var items = watched.Items.Select(card => new PosterItem(card, OpenTitleCommand)).ToList();
                BecauseYouWatched = ShelfViewModel.OfPosters($"Because you watched {watched.Title}", items);
            }
        }
        catch (ApiException error)
        {
            if (current != generation || error.IsCancellation)
            {
                return;
            }
            if (error.IsTmdbUnconfigured())
            {
                IsTmdbMissing = true;
                IsLoading = false;
                return;
            }
            // The grid may still load; a page success clears this.
            ErrorMessage = error.Message;
        }

        await LoadNextPageAsync(retrying: false, token);
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
        var requested = Filters;
        IsLoadingPage = true;
        try
        {
            var attempts = 0;
            var appended = 0;
            do
            {
                Paginated<TitleCard> page;
                try
                {
                    page = await model.Api.Browse.PageAsync(mediaType, requested, nextPage, token);
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
                // Popularity ranking shifts between requests: drop repeats.
                foreach (var card in page.Results)
                {
                    if (seen.Add(card.Id))
                    {
                        Cards.Add(new PosterItem(card, OpenTitleCommand));
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
    /// The first page failing is the page's error (the empty state offers
    /// "Try again"); a later one only pauses paging behind the Retry row.
    /// </summary>
    private void PageFailed(ApiException error)
    {
        if (Cards.Count == 0)
        {
            ErrorMessage = error.Message;
        }
        else
        {
            PageError = error.Message;
        }
    }

    // MARK: Actions

    /// <summary>"🎲 Surprise me": one random title for the current filters, opened straight away.</summary>
    [RelayCommand]
    private async Task SurpriseAsync()
    {
        if (IsSurprising)
        {
            return;
        }
        IsSurprising = true;
        SurpriseError = null;
        var filters = Filters;
        var request = new SurpriseRequest(SurpriseKind.Of(mediaType), filters.GenreId, filters.Year, filters.HideOwned);
        try
        {
            var picked = await model.Api.Discover.SurpriseAsync(request);
            model.OpenTitle(picked);
        }
        catch (ApiException error)
        {
            SurpriseError = error.Message;
        }
        finally
        {
            IsSurprising = false;
        }
    }

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
