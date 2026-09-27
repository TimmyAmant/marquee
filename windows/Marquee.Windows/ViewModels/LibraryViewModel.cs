using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Globalization;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>The Library page's four tabs, in the order the page shows them.</summary>
public enum LibraryTab
{
    All,
    Collections,

    /// <summary>The admin only; a member never sees the tab.</summary>
    Duplicates,

    Storage,
}

/// <summary>
/// app/library/page.tsx (api-v1.md section 17, 0.51+): everything the
/// household owns in one place. "All titles" is a filtered, sorted, paged
/// list shown as a poster grid or a table (the same entries, two shapes);
/// "Missing from collections", "Duplicates" (admin) and "Storage" each load
/// once when first opened and again after a reset.
///
/// The filters are this page's own (<see cref="LibraryQuery"/>), not the
/// model's: the website starts every visit unfiltered. The pickers offer
/// only what the server says the library has (<see cref="LibraryFilters"/>),
/// which arrives with page 1 and is kept across resets so the bar doesn't
/// flicker. Paging appends like the Movies/Series grid: a later page failing
/// pauses behind Retry instead of throwing the rows away.
/// </summary>
public sealed partial class LibraryViewModel : ObservableObject
{
    /// <summary>Typing in the search box waits this long for the next key before asking the server.</summary>
    public static readonly TimeSpan SearchDelay = TimeSpan.FromMilliseconds(300);

    private readonly AppModel model;
    private bool active;
    private int generation;
    private CancellationTokenSource? pageCancellation;
    private CancellationTokenSource? searchCancellation;
    private CancellationTokenSource? collectionsCancellation;
    private CancellationTokenSource? duplicatesCancellation;
    private CancellationTokenSource? storageCancellation;
    private int nextPage = 1;
    private bool syncingPickers;
    private LibraryQuery query = LibraryQuery.Default;
    private LibraryFilters filters = LibraryFilters.Empty;
    private bool collectionsLoaded;
    private bool duplicatesLoaded;
    private bool storageLoaded;
    private readonly HashSet<TitleId> seen = [];

    /// <summary>The statuses the picker offers: every known one but "untracked", which the library never has.</summary>
    private static readonly IReadOnlyList<LibraryStatus> StatusChoices =
        LibraryStatus.Known.Where(status => status != LibraryStatus.Untracked).ToList();

    public ObservableCollection<PosterItem> Cards { get; } = [];
    public ObservableCollection<LibraryRow> Rows { get; } = [];

    // MARK: Tabs

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsAllTab), nameof(IsCollectionsTab), nameof(IsDuplicatesTab), nameof(IsStorageTab))]
    private LibraryTab tab = LibraryTab.All;

    public bool IsAllTab => Tab == LibraryTab.All;
    public bool IsCollectionsTab => Tab == LibraryTab.Collections;
    public bool IsDuplicatesTab => Tab == LibraryTab.Duplicates;
    public bool IsStorageTab => Tab == LibraryTab.Storage;

    // MARK: All titles

    /// <summary>The spinner: only until page 1 answers after a reset.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsGrid), nameof(ShowsTable))]
    private bool isLoading;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsLoadMoreButton))]
    private bool isLoadingPage;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsLoadMore), nameof(ShowsLoadMoreButton))]
    private bool hasNextPage;

    /// <summary>A later page failed; paging waits for Retry.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasPageError), nameof(ShowsLoadMoreButton))]
    private string? pageError;

    /// <summary>Page 1 failed (an older server answers 404 here too).</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError), nameof(ShowsError))]
    private string? errorMessage;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsGrid), nameof(ShowsTable), nameof(ShowsError))]
    private bool hasCards;

    /// <summary>The table rather than the poster grid.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsGrid), nameof(ShowsTable), nameof(IsGridView))]
    private bool isTableView;

    /// <summary>Neither Plex, Jellyfin, Sonarr nor Radarr is connected.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanOpenSettings), nameof(ShowsFilterBar))]
    private bool isNotConnected;

    /// <summary>Page 1 came back empty with filters set.</summary>
    [ObservableProperty]
    private bool isNoMatches;

    /// <summary>Page 1 came back empty with no filters: the sync hasn't run yet.</summary>
    [ObservableProperty]
    private bool isStillSyncing;

    [ObservableProperty]
    private string countsLine = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasTrackedNote))]
    private string? trackedNote;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasCounts))]
    private bool hasSummary;

    // MARK: Filter bar

    [ObservableProperty]
    private string searchText = "";

    [ObservableProperty]
    private int typeIndex;

    [ObservableProperty]
    private int statusIndex;

    [ObservableProperty]
    private IReadOnlyList<string> sourceOptions = [Loc.Get("Library_AllSources")];

    [ObservableProperty]
    private int sourceIndex;

    [ObservableProperty]
    private IReadOnlyList<string> resolutionOptions = [Loc.Get("Library_AllResolutions")];

    [ObservableProperty]
    private int resolutionIndex;

    [ObservableProperty]
    private IReadOnlyList<string> codecOptions = [Loc.Get("Library_AllCodecs")];

    [ObservableProperty]
    private int codecIndex;

    [ObservableProperty]
    private IReadOnlyList<string> genreOptions = [Loc.Get("Browse_AllGenres")];

    [ObservableProperty]
    private int genreIndex;

    [ObservableProperty]
    private IReadOnlyList<string> yearOptions = [Loc.Get("Browse_AllYears")];

    [ObservableProperty]
    private int yearIndex;

    [ObservableProperty]
    private int sortIndex;

    [ObservableProperty]
    private bool hdrOnly;

    /// <summary>The "HDR only" box only when the library has any HDR file (or the filter is already on).</summary>
    [ObservableProperty]
    private bool showsHdrToggle;

    [ObservableProperty]
    private bool hasActiveFilters;

    // MARK: Missing from collections

    [ObservableProperty]
    private bool isLoadingCollections;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasCollectionsError))]
    private string? collectionsError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasCollections))]
    private IReadOnlyList<LibraryCollectionItem> collections = [];

    [ObservableProperty]
    private bool isCollectionsEmpty;

    // MARK: Duplicates

    [ObservableProperty]
    private bool isLoadingDuplicates;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasDuplicatesError))]
    private string? duplicatesError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasDuplicates))]
    private IReadOnlyList<LibraryDuplicateItem> duplicates = [];

    [ObservableProperty]
    private bool isDuplicatesEmpty;

    // MARK: Storage

    [ObservableProperty]
    private bool isLoadingStorage;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasStorageError))]
    private string? storageError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasStorage))]
    private bool hasStorageAnswer;

    [ObservableProperty]
    private bool isStorageEmpty;

    [ObservableProperty]
    private IReadOnlyList<LibraryFolderItem> folders = [];

    [ObservableProperty]
    private string totalFreeLabel = "";

    [ObservableProperty]
    private string forecastLine = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasAroundLine))]
    private string? aroundLine;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasMeasuredLine))]
    private string? measuredLine;

    public LibraryViewModel(AppModel model)
    {
        this.model = model;
        Cards.CollectionChanged += (_, _) => HasCards = Cards.Count > 0;
    }

    // MARK: Derived

    public bool IsAdmin => model.Viewer?.IsAdmin == true;

    /// <summary>The Duplicates tab is the admin's.</summary>
    public bool ShowsDuplicatesTab => IsAdmin;

    public bool HasError => ErrorMessage != null;
    public bool ShowsError => HasError && !HasCards;
    public bool HasPageError => PageError != null;
    public bool ShowsLoadMore => HasNextPage;
    public bool ShowsLoadMoreButton => HasNextPage && !IsLoadingPage && PageError == null;
    public bool IsGridView => !IsTableView;
    public bool ShowsGrid => HasCards && !IsTableView && !IsLoading;
    public bool ShowsTable => HasCards && IsTableView && !IsLoading;
    public bool HasTrackedNote => TrackedNote != null;
    public bool HasCounts => HasSummary && !IsNotConnected;

    /// <summary>The filter bar hides behind the "Connect …" state; an empty filtered list keeps it, so the filters can be undone.</summary>
    public bool ShowsFilterBar => !IsNotConnected;

    public string ConnectMessage => LibraryText.ConnectMessage(IsAdmin);
    public bool CanOpenSettings => IsNotConnected && IsAdmin;
    public string StorageEmptyMessage => LibraryText.StorageEmptyMessage(IsAdmin);

    public bool HasCollectionsError => CollectionsError != null;
    public bool HasCollections => Collections.Count > 0;
    public bool HasDuplicatesError => DuplicatesError != null;
    public bool HasDuplicates => Duplicates.Count > 0;
    public bool HasStorageError => StorageError != null;
    public bool HasStorage => HasStorageAnswer && !IsStorageEmpty;
    public bool HasAroundLine => AroundLine != null;
    public bool HasMeasuredLine => MeasuredLine != null;

    /// <summary>"Movies and series", "Movies", "Series".</summary>
    public IReadOnlyList<string> TypeOptions { get; } =
        [Loc.Get("Library_AllTypes"), MediaType.Movie.PluralLabel, MediaType.Tv.PluralLabel];

    /// <summary>"Any status", then every library status but untracked.</summary>
    public IReadOnlyList<string> StatusOptions { get; } =
        new[] { Loc.Get("Library_AllStatuses") }.Concat(StatusChoices.Select(status => status.Label)).ToList();

    public IReadOnlyList<string> SortOptions { get; } = LibrarySortExtensions.All.Select(sort => sort.Label()).ToList();

    // MARK: Tabs

    /// <summary>A tab button: shows the tab, loading it the first time (and after a reset).</summary>
    public void SelectTab(LibraryTab requested)
    {
        if (requested == LibraryTab.Duplicates && !IsAdmin)
        {
            requested = LibraryTab.All;
        }
        Tab = requested;
        // A ToggleButton flips itself on every click; re-announce so the
        // bindings put the checked state back even when the tab didn't change.
        OnPropertyChanged(nameof(IsAllTab));
        OnPropertyChanged(nameof(IsCollectionsTab));
        OnPropertyChanged(nameof(IsDuplicatesTab));
        OnPropertyChanged(nameof(IsStorageTab));
        EnsureLoaded(requested);
    }

    private void EnsureLoaded(LibraryTab requested)
    {
        if (!active)
        {
            return;
        }
        switch (requested)
        {
            case LibraryTab.Collections when !collectionsLoaded:
                _ = LoadCollectionsAsync();
                break;
            case LibraryTab.Duplicates when !duplicatesLoaded:
                _ = LoadDuplicatesAsync();
                break;
            case LibraryTab.Storage when !storageLoaded:
                _ = LoadStorageAsync();
                break;
        }
    }

    [RelayCommand]
    private void ShowGrid() => IsTableView = false;

    [RelayCommand]
    private void ShowTable() => IsTableView = true;

    // MARK: Filters

    private void SetQuery(LibraryQuery requested)
    {
        if (requested == query)
        {
            return;
        }
        query = requested;
        _ = ResetAsync();
    }

    /// <summary>The pickers follow the query and the server's choices; a picker change writes back through the On*Changed hooks.</summary>
    private void SyncPickers()
    {
        syncingPickers = true;
        try
        {
            SourceOptions = new[] { Loc.Get("Library_AllSources") }.Concat(filters.Sources.Select(source => source.DisplayName)).ToList();
            ResolutionOptions = new[] { Loc.Get("Library_AllResolutions") }.Concat(filters.Resolutions.Select(resolution => resolution.Label)).ToList();
            CodecOptions = new[] { Loc.Get("Library_AllCodecs") }.Concat(filters.Codecs).ToList();
            GenreOptions = new[] { Loc.Get("Browse_AllGenres") }.Concat(filters.Genres).ToList();
            YearOptions = new[] { Loc.Get("Browse_AllYears") }.Concat(filters.Years.Select(year => year.ToString(CultureInfo.InvariantCulture))).ToList();

            TypeIndex = query.Type == MediaType.Movie ? 1 : query.Type == MediaType.Tv ? 2 : 0;
            StatusIndex = query.Status is { } status ? StatusChoices.ToList().IndexOf(status) + 1 : 0;
            SourceIndex = query.Source is { } source ? filters.Sources.ToList().IndexOf(source) + 1 : 0;
            ResolutionIndex = query.Resolution is { } resolution ? filters.Resolutions.ToList().IndexOf(resolution) + 1 : 0;
            CodecIndex = query.Codec is { } codec ? IndexOfIgnoringCase(filters.Codecs, codec) + 1 : 0;
            GenreIndex = query.Genre is { } genre ? IndexOfIgnoringCase(filters.Genres, genre) + 1 : 0;
            YearIndex = query.Year is { } year ? filters.Years.ToList().IndexOf(year) + 1 : 0;
            SortIndex = LibrarySortExtensions.All.ToList().IndexOf(query.Sort);
            HdrOnly = query.Hdr;
            ShowsHdrToggle = filters.HasHdr || query.Hdr;
            SearchText = query.Q ?? "";
            HasActiveFilters = query.HasFilters || query.Sort != LibrarySort.Recent;
        }
        finally
        {
            syncingPickers = false;
        }
    }

    /// <summary>-1 when absent, so "+ 1" lands on the "Any …" row.</summary>
    private static int IndexOfIgnoringCase(IReadOnlyList<string> options, string value)
    {
        for (var index = 0; index < options.Count; index++)
        {
            if (string.Equals(options[index], value, StringComparison.OrdinalIgnoreCase))
            {
                return index;
            }
        }
        return -1;
    }

    /// <summary>A ComboBox whose items change reports -1 for a moment; that is not a choice.</summary>
    private bool IsPickerChoice(int value, int optionCount) => !syncingPickers && value >= 0 && value < optionCount;

    partial void OnTypeIndexChanged(int value)
    {
        if (IsPickerChoice(value, TypeOptions.Count))
        {
            SetQuery(query with { Type = value == 1 ? MediaType.Movie : value == 2 ? MediaType.Tv : null });
        }
    }

    partial void OnStatusIndexChanged(int value)
    {
        if (IsPickerChoice(value, StatusOptions.Count))
        {
            SetQuery(query with { Status = value == 0 ? null : StatusChoices[value - 1] });
        }
    }

    partial void OnSourceIndexChanged(int value)
    {
        if (IsPickerChoice(value, SourceOptions.Count))
        {
            SetQuery(query with { Source = value == 0 ? null : filters.Sources[value - 1] });
        }
    }

    partial void OnResolutionIndexChanged(int value)
    {
        if (IsPickerChoice(value, ResolutionOptions.Count))
        {
            SetQuery(query with { Resolution = value == 0 ? null : filters.Resolutions[value - 1] });
        }
    }

    partial void OnCodecIndexChanged(int value)
    {
        if (IsPickerChoice(value, CodecOptions.Count))
        {
            SetQuery(query with { Codec = value == 0 ? null : filters.Codecs[value - 1] });
        }
    }

    partial void OnGenreIndexChanged(int value)
    {
        if (IsPickerChoice(value, GenreOptions.Count))
        {
            SetQuery(query with { Genre = value == 0 ? null : filters.Genres[value - 1] });
        }
    }

    partial void OnYearIndexChanged(int value)
    {
        if (IsPickerChoice(value, YearOptions.Count))
        {
            SetQuery(query with { Year = value == 0 ? null : filters.Years[value - 1] });
        }
    }

    partial void OnSortIndexChanged(int value)
    {
        if (IsPickerChoice(value, SortOptions.Count))
        {
            SetQuery(query with { Sort = LibrarySortExtensions.All[value] });
        }
    }

    partial void OnHdrOnlyChanged(bool value)
    {
        if (!syncingPickers)
        {
            SetQuery(query with { Hdr = value });
        }
    }

    /// <summary>The search box: waits for typing to pause, then asks with <c>?q=</c>.</summary>
    partial void OnSearchTextChanged(string value)
    {
        if (syncingPickers)
        {
            return;
        }
        searchCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        searchCancellation = cancellation;
        _ = ApplySearchAsync(value, cancellation.Token);
    }

    private async Task ApplySearchAsync(string text, CancellationToken token)
    {
        try
        {
            await Task.Delay(SearchDelay, token);
        }
        catch (OperationCanceledException)
        {
            return;
        }
        if (!token.IsCancellationRequested)
        {
            SetQuery(query with { Q = text.NonBlank() });
        }
    }

    [RelayCommand]
    private void ToggleHdr() => HdrOnly = !HdrOnly;

    /// <summary>Back to the plain, recently-added library.</summary>
    [RelayCommand]
    private void ClearFilters()
    {
        searchCancellation?.Cancel();
        SetQuery(LibraryQuery.Default);
        SyncPickers();
    }

    // MARK: Lifecycle

    public void Activate()
    {
        if (active)
        {
            return;
        }
        active = true;
        model.PropertyChanged += OnModelPropertyChanged;
        model.Events.Changed += OnServerChanged;
        SyncPickers();
        _ = ResetAsync();
        EnsureLoaded(Tab);
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
        pageCancellation?.Cancel();
        searchCancellation?.Cancel();
        collectionsCancellation?.Cancel();
        duplicatesCancellation?.Cancel();
        storageCancellation?.Cancel();
    }

    // MARK: All titles

    /// <summary>Starts the list over from page 1 (also "Try again"), and marks the other tabs stale.</summary>
    [RelayCommand]
    private async Task ResetAsync()
    {
        generation++;
        var current = generation;
        pageCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        pageCancellation = cancellation;
        var token = cancellation.Token;

        IsLoading = true;
        Cards.Clear();
        Rows.Clear();
        seen.Clear();
        nextPage = 1;
        HasNextPage = true;
        IsLoadingPage = false;
        ErrorMessage = null;
        PageError = null;
        IsNoMatches = false;
        IsStillSyncing = false;

        collectionsLoaded = false;
        duplicatesLoaded = false;
        storageLoaded = false;
        EnsureLoaded(Tab);

        await LoadNextPageAsync(retrying: false, token);
        if (current == generation)
        {
            IsLoading = false;
            var empty = Cards.Count == 0 && ErrorMessage == null && !IsNotConnected;
            IsNoMatches = empty && query.HasFilters;
            IsStillSyncing = empty && !query.HasFilters;
        }
    }

    [RelayCommand]
    private Task LoadMoreAsync() => LoadNextPageAsync(retrying: false, pageCancellation?.Token ?? CancellationToken.None);

    [RelayCommand]
    private Task RetryPageAsync() => LoadNextPageAsync(retrying: true, pageCancellation?.Token ?? CancellationToken.None);

    /// <summary>Called by the page as the list scrolls; a paused (failed) page waits for Retry.</summary>
    public void LoadMoreIfScrolled()
    {
        if (IsAllTab && HasNextPage && !IsLoadingPage && PageError == null && !IsLoading)
        {
            _ = LoadMoreAsync();
        }
    }

    private async Task LoadNextPageAsync(bool retrying, CancellationToken token)
    {
        if (!HasNextPage || IsLoadingPage || (!retrying && PageError != null))
        {
            return;
        }
        var current = generation;
        var requested = query;
        IsLoadingPage = true;
        try
        {
            LibraryResults page;
            try
            {
                page = await model.Api.Library.PageAsync(requested, nextPage, token);
            }
            catch (ApiException error)
            {
                if (current != generation || error.IsCancellation)
                {
                    return;
                }
                if (Cards.Count == 0)
                {
                    ErrorMessage = error.Message;
                }
                else
                {
                    PageError = error.Message;
                }
                return;
            }
            if (current != generation)
            {
                return;
            }
            if (page.Page <= 1)
            {
                filters = page.Filters;
                CountsLine = LibraryText.CountsLine(page.Summary);
                TrackedNote = LibraryText.TrackedNote(page.Summary);
                HasSummary = true;
                IsNotConnected = !page.Connected;
                SyncPickers();
            }
            var isAdmin = IsAdmin;
            foreach (var entry in page.Results)
            {
                if (seen.Add(entry.Id))
                {
                    Cards.Add(new PosterItem(model, entry.ToTitleCard(), OpenTitleCommand, showsTypeLabel: true));
                    Rows.Add(new LibraryRow(model, entry, OpenTitleCommand, isAdmin));
                }
            }
            HasNextPage = page.HasMorePages;
            nextPage = page.Page + 1;
            ErrorMessage = null;
            PageError = null;
        }
        finally
        {
            if (current == generation)
            {
                IsLoadingPage = false;
            }
        }
    }

    // MARK: Missing from collections

    [RelayCommand]
    private Task LoadCollectionsAsync() => LoadCollectionsAsync(quiet: false);

    /// <param name="quiet">After "Add all" / "Request all": refetch behind the list, keeping each item's result line.</param>
    private async Task LoadCollectionsAsync(bool quiet)
    {
        collectionsCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        collectionsCancellation = cancellation;
        var token = cancellation.Token;
        collectionsLoaded = true;
        IsLoadingCollections = !quiet;
        CollectionsError = null;
        try
        {
            var fresh = await model.Api.Library.CollectionsMissingAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            var previous = Collections.ToDictionary(item => item.Key, StringComparer.Ordinal);
            var items = new List<LibraryCollectionItem>(fresh.Count);
            foreach (var collection in fresh)
            {
                var item = new LibraryCollectionItem(model, collection, OpenTitleCommand, () => LoadCollectionsAsync(quiet: true));
                if (previous.TryGetValue(collection.Key, out var old))
                {
                    item.KeepResultsFrom(old);
                }
                items.Add(item);
            }
            Collections = items;
            IsCollectionsEmpty = items.Count == 0;
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            if (!quiet)
            {
                collectionsLoaded = false;
                CollectionsError = error.Message;
            }
        }
        finally
        {
            if (!token.IsCancellationRequested)
            {
                IsLoadingCollections = false;
            }
        }
    }

    // MARK: Duplicates

    [RelayCommand]
    private async Task LoadDuplicatesAsync()
    {
        duplicatesCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        duplicatesCancellation = cancellation;
        var token = cancellation.Token;
        duplicatesLoaded = true;
        IsLoadingDuplicates = true;
        DuplicatesError = null;
        try
        {
            var fresh = await model.Api.Library.DuplicatesAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            Duplicates = fresh.Select(duplicate => new LibraryDuplicateItem(duplicate, OpenTitleCommand)).ToList();
            IsDuplicatesEmpty = fresh.Count == 0;
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            duplicatesLoaded = false;
            DuplicatesError = error.Message;
        }
        finally
        {
            if (!token.IsCancellationRequested)
            {
                IsLoadingDuplicates = false;
            }
        }
    }

    // MARK: Storage

    [RelayCommand]
    private async Task LoadStorageAsync()
    {
        storageCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        storageCancellation = cancellation;
        var token = cancellation.Token;
        storageLoaded = true;
        IsLoadingStorage = !HasStorageAnswer;
        StorageError = null;
        try
        {
            var storage = await model.Api.Library.StorageAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            Folders = storage.Folders.Select(folder => new LibraryFolderItem(folder)).ToList();
            TotalFreeLabel = storage.TotalFreeLabel;
            ForecastLine = LibraryText.ForecastLine(storage.Forecast);
            AroundLine = LibraryText.AroundLine(storage.Forecast);
            MeasuredLine = LibraryText.MeasuredLine(storage);
            IsStorageEmpty = storage.IsEmpty;
            HasStorageAnswer = true;
            OnPropertyChanged(nameof(HasStorage));
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            storageLoaded = false;
            if (!HasStorageAnswer)
            {
                StorageError = error.Message;
            }
        }
        finally
        {
            if (!token.IsCancellationRequested)
            {
                IsLoadingStorage = false;
            }
        }
    }

    // MARK: Actions

    /// <summary>A poster, a table row or a duplicate's title: open the title page.</summary>
    [RelayCommand]
    private void OpenTitle(object? item)
    {
        switch (item)
        {
            case PosterItem poster:
                model.OpenTitle(poster.Id);
                break;
            case LibraryRow row:
                model.OpenTitle(row.Id);
                break;
            case LibraryDuplicateItem duplicate:
                model.OpenTitle(duplicate.Id);
                break;
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
            OnPropertyChanged(nameof(IsAdmin));
            OnPropertyChanged(nameof(ShowsDuplicatesTab));
            OnPropertyChanged(nameof(ConnectMessage));
            OnPropertyChanged(nameof(CanOpenSettings));
            OnPropertyChanged(nameof(StorageEmptyMessage));
            if (IsDuplicatesTab && !IsAdmin)
            {
                SelectTab(LibraryTab.All);
            }
        }
    }

    /// <summary>
    /// The library moving on the server (a sync finished) or an integration
    /// changing starts every tab over. This app's own actions on a title
    /// don't: the collections tab refetches itself after "Add all", and a
    /// row's monitoring flips in place.
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
