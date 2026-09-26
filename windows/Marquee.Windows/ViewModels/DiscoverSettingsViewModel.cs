using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// One row of Settings › Discover: its name, what it is ("Built-in row", or
/// a custom row's kind and source), Move up/Move down, the Show switch, and
/// Rename/Remove for the admin's own rows. Rebuilt from every answer; the
/// switch sends its change as it flips.
/// </summary>
public sealed partial class DiscoverRowItem : ObservableObject
{
    private readonly DiscoverSettingsViewModel owner;
    private readonly bool ready;

    public DiscoverRowItem(DiscoverSettingsViewModel owner, DiscoverShelfSetting setting, int index, int count)
    {
        this.owner = owner;
        Setting = setting;
        Title = setting.Title;
        Subtitle = setting.Subtitle;
        IsCustom = setting.Custom;
        ShowsDivider = index > 0;
        CanMoveUp = index > 0;
        CanMoveDown = index < count - 1;
        IsShown = !setting.Hidden;
        ready = true;
    }

    public DiscoverShelfSetting Setting { get; }
    public string Title { get; }

    /// <summary>"Built-in row", or "TMDb keyword · anime · Movies and series".</summary>
    public string Subtitle { get; }

    /// <summary>The admin's own row: Rename and Remove show.</summary>
    public bool IsCustom { get; }

    public bool ShowsDivider { get; }
    public bool CanMoveUp { get; }
    public bool CanMoveDown { get; }

    /// <summary>"Move {name} up", for a screen reader.</summary>
    public string MoveUpLabel => Loc.Format("DiscoverSettings_MoveRowUp", Title);
    public string MoveDownLabel => Loc.Format("DiscoverSettings_MoveRowDown", Title);

    /// <summary>The Show switch: on Discover, or hidden from everyone.</summary>
    [ObservableProperty]
    private bool isShown;

    partial void OnIsShownChanged(bool value)
    {
        if (ready)
        {
            _ = owner.SetShownAsync(this, value);
        }
    }

    [RelayCommand]
    private Task MoveUpAsync() => owner.MoveAsync(this, -1);

    [RelayCommand]
    private Task MoveDownAsync() => owner.MoveAsync(this, 1);

    [RelayCommand]
    private Task RenameAsync() => owner.RenameAsync(this);

    [RelayCommand]
    private Task RemoveAsync() => owner.RemoveAsync(this);
}

/// <summary>
/// Settings › Discover (0.49+), the admin's: every Discover row in order,
/// hidden ones included, each with Move up/Move down and a Show switch, the
/// admin's own rows also with Rename and Remove, "Reset to default", and the
/// Add row form: what it's built from (a TMDb keyword, genre, studio,
/// network or list, a Trakt list, or recently added to Plex/Jellyfin), a
/// search for the keyword/genre/studio/network, movies or series where it
/// applies, the list's link, and an optional name. The rules live in
/// <see cref="DiscoverLayoutEditing"/>; this adds the bindable state.
/// </summary>
public sealed partial class DiscoverSettingsViewModel : ObservableObject
{
    public static string Description => Loc.Get("DiscoverSettings_Description");

    private static readonly TimeSpan SearchDelay = TimeSpan.FromMilliseconds(300);

    private readonly AppModel model;
    private CancellationTokenSource? loadCancellation;
    private CancellationTokenSource? searchCancellation;
    private DiscoverSettings? settings;
    private IReadOnlyList<DiscoverLookupResult> results = [];
    private bool active;

    public DiscoverSettingsViewModel(AppModel model)
    {
        this.model = model;
        KindChoices = DiscoverRowKind.CustomKinds.Select(kind => kind.Label).ToList();
    }

    /// <summary>Set by the page: the Rename dialog, answering the new name or null when cancelled.</summary>
    internal Func<DiscoverRowItem, Task<string?>>? RenamePrompt { get; set; }

    /// <summary>Set by the page: "Remove {name}?", true only when confirmed.</summary>
    internal Func<DiscoverRowItem, Task<bool>>? RemovePrompt { get; set; }

    /// <summary>Set by the page: "Reset Discover?", true only when confirmed.</summary>
    internal Func<Task<bool>>? ResetPrompt { get; set; }

    public string DescriptionText => Description;

    // MARK: The list

    /// <summary>The spinner, until the first answer.</summary>
    [ObservableProperty]
    private bool isLoading;

    /// <summary>The first load failed; shown alone, with "Try again".</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    private string? loadError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasRows))]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    private IReadOnlyList<DiscoverRowItem> rows = [];

    /// <summary>A failed move, show/hide, rename, remove or reset, in the InfoBar.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    /// <summary>A change is on its way to the server: the list waits for it.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanReset))]
    private bool isBusy;

    /// <summary>"3 of 30 rows of your own".</summary>
    [ObservableProperty]
    private string customCountLine = "";

    public bool HasRows => Rows.Count > 0;
    public bool ShowsError => LoadError != null && !HasRows;
    public bool HasError => Error != null;
    public bool CanReset => !IsBusy;

    // MARK: Lifecycle

    public void Activate()
    {
        if (active)
        {
            return;
        }
        active = true;
        _ = LoadAsync();
    }

    public void Deactivate()
    {
        if (!active)
        {
            return;
        }
        active = false;
        loadCancellation?.Cancel();
        searchCancellation?.Cancel();
    }

    /// <summary><c>GET /settings/discover</c>; also "Try again". A failure keeps what's shown.</summary>
    [RelayCommand]
    private async Task LoadAsync()
    {
        loadCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        loadCancellation = cancellation;
        var token = cancellation.Token;
        IsLoading = settings == null;
        LoadError = null;
        try
        {
            var fresh = await model.Api.DiscoverSettings.GetAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            if (fresh == null)
            {
                LoadError = Loc.Get("DiscoverSettings_ServerTooOld");
                return;
            }
            Apply(fresh);
            if (results.Count == 0 && ShowsSearch && SelectedKind == DiscoverRowKind.Genre)
            {
                _ = SearchAsync(immediately: true);
            }
        }
        catch (ApiException failure)
        {
            if (!failure.IsCancellation && !token.IsCancellationRequested)
            {
                LoadError = failure.Message;
            }
        }
        finally
        {
            if (!token.IsCancellationRequested)
            {
                IsLoading = false;
            }
        }
    }

    private void Apply(DiscoverSettings fresh)
    {
        settings = fresh;
        Show(fresh.Shelves);
        CustomCountLine = Loc.Plural("DiscoverSettings_CustomCount", fresh.MaxCustomShelves, fresh.CustomCount);
        OnPropertyChanged(nameof(ShowsTraktNote));
    }

    /// <summary>Redraws the list (optimistically, before the server answers a move).</summary>
    private void Show(IReadOnlyList<DiscoverShelfSetting> shelves) =>
        Rows = shelves.Select((shelf, index) => new DiscoverRowItem(this, shelf, index, shelves.Count)).ToList();

    private IReadOnlyList<DiscoverShelfSetting> Current => settings?.Shelves ?? [];

    // MARK: Changes

    /// <summary>
    /// Move up/Move down: the list moves at once, then <c>PUT /settings/discover</c>
    /// with the whole order; a refusal puts it back and says why.
    /// </summary>
    internal async Task MoveAsync(DiscoverRowItem item, int offset)
    {
        if (IsBusy || settings is not { } before)
        {
            return;
        }
        var index = before.Shelves.ToList().FindIndex(shelf => shelf.Id == item.Setting.Id);
        var moved = DiscoverLayoutEditing.Move(before.Shelves, index, offset);
        if (ReferenceEquals(moved, before.Shelves))
        {
            return;
        }
        await ChangeAsync(
            optimistic: moved,
            change: api => api.DiscoverSettings.SaveLayoutAsync(DiscoverLayoutEditing.LayoutRequest(moved)));
    }

    /// <summary>The Show switch: <c>PATCH /settings/discover/shelves/{id}</c> with <c>hidden</c>.</summary>
    internal async Task SetShownAsync(DiscoverRowItem item, bool shown)
    {
        if (IsBusy || settings == null)
        {
            Show(Current);
            return;
        }
        await ChangeRowAsync(api => api.DiscoverSettings.UpdateShelfAsync(item.Setting.Id, new DiscoverShelfPatch(Hidden: !shown)));
    }

    /// <summary>Rename (a custom row): the dialog, then <c>PATCH</c> with the new <c>title</c>.</summary>
    internal async Task RenameAsync(DiscoverRowItem item)
    {
        if (IsBusy || !item.IsCustom || RenamePrompt is not { } prompt)
        {
            return;
        }
        var name = (await prompt(item))?.Trim();
        if (name.NonBlank() is not { } title || title == item.Title)
        {
            return;
        }
        await ChangeRowAsync(api => api.DiscoverSettings.UpdateShelfAsync(item.Setting.Id, new DiscoverShelfPatch(Title: title)));
    }

    /// <summary>Remove (a custom row) once confirmed: <c>DELETE</c>, then the list is re-read.</summary>
    internal async Task RemoveAsync(DiscoverRowItem item)
    {
        if (IsBusy || !item.IsCustom || RemovePrompt is not { } confirm || !await confirm(item))
        {
            return;
        }
        IsBusy = true;
        Error = null;
        try
        {
            await model.Api.DiscoverSettings.RemoveShelfAsync(item.Setting.Id);
        }
        catch (ApiException failure) when (failure.Kind != ApiErrorKind.NotFound)
        {
            // A 404 means it's gone already: just re-read.
            Error = failure.Message;
        }
        finally
        {
            IsBusy = false;
        }
        await LoadAsync();
    }

    /// <summary>"Reset to default" once confirmed: the built-in rows back in order, all shown; the admin's own rows stay, after them.</summary>
    [RelayCommand]
    private async Task ResetAsync()
    {
        if (IsBusy || ResetPrompt is not { } confirm || !await confirm())
        {
            return;
        }
        await ChangeAsync(optimistic: null, change: api => api.DiscoverSettings.ResetAsync());
    }

    /// <summary>A change answering the whole list; a failure puts back what the server has.</summary>
    private async Task ChangeAsync(IReadOnlyList<DiscoverShelfSetting>? optimistic, Func<MarqueeApi, Task<DiscoverSettings>> change)
    {
        IsBusy = true;
        Error = null;
        if (optimistic != null)
        {
            Show(optimistic);
        }
        try
        {
            Apply(await change(model.Api));
        }
        catch (ApiException failure)
        {
            Error = failure.Message;
            Show(Current);
        }
        finally
        {
            IsBusy = false;
        }
    }

    /// <summary>
    /// A change answering one row, which replaces its old self in place (the
    /// Show switch has already flipped); a failure puts back what the server has.
    /// </summary>
    private async Task ChangeRowAsync(Func<MarqueeApi, Task<DiscoverShelfSetting>> change)
    {
        IsBusy = true;
        Error = null;
        try
        {
            var row = await change(model.Api);
            if (settings is { } known)
            {
                Apply(known with { Shelves = known.Shelves.Select(shelf => shelf.Id == row.Id ? row : shelf).ToList() });
            }
        }
        catch (ApiException failure)
        {
            Error = failure.Message;
            Show(Current);
        }
        finally
        {
            IsBusy = false;
        }
    }

    // MARK: Add row

    /// <summary>"TMDb keyword", "Genre", …, in <see cref="DiscoverRowKind.CustomKinds"/>' order.</summary>
    public IReadOnlyList<string> KindChoices { get; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SelectedKind), nameof(ShowsSearch), nameof(SearchHeader), nameof(SearchPlaceholder), nameof(ShowsLink), nameof(LinkHeader), nameof(LinkPlaceholder), nameof(ShowsTraktNote))]
    private int kindIndex;

    public DiscoverRowKind SelectedKind => DiscoverRowKind.CustomKinds[Math.Clamp(KindIndex, 0, DiscoverRowKind.CustomKinds.Count - 1)];

    /// <summary>A keyword, genre, studio or network is picked from a search.</summary>
    public bool ShowsSearch => DiscoverLayoutEditing.LookupKind(SelectedKind) != null;

    public string SearchHeader =>
        SelectedKind == DiscoverRowKind.Genre ? Loc.Get("DiscoverSettings_SearchGenre")
        : SelectedKind == DiscoverRowKind.Company ? Loc.Get("DiscoverSettings_SearchStudio")
        : SelectedKind == DiscoverRowKind.Network ? Loc.Get("DiscoverSettings_SearchNetwork")
        : Loc.Get("DiscoverSettings_SearchKeyword");

    public string SearchPlaceholder => DiscoverLayoutEditing.SearchPlaceholder(SelectedKind);

    [ObservableProperty]
    private string searchText = "";

    /// <summary>The search's results as "A24 (US)".</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasResults))]
    private IReadOnlyList<string> resultLabels = [];

    public bool HasResults => ResultLabels.Count > 0;

    /// <summary>The picked result; −1 for none.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(PickedLine))]
    private int resultIndex = -1;

    /// <summary>"Picked: A24 (US)", or empty.</summary>
    public string PickedLine => Picked is { } picked ? Loc.Format("DiscoverSettings_Picked", picked.Label) : "";

    private DiscoverLookupResult? Picked => ResultIndex >= 0 && ResultIndex < results.Count ? results[ResultIndex] : null;

    [ObservableProperty]
    private bool isSearching;

    /// <summary>A failed search (TMDb not set up, say).</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSearchError))]
    private string? searchError;

    public bool HasSearchError => SearchError != null;

    /// <summary>"Movies and series", "Movies", "Series", as far as the kind offers them.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsMediaType))]
    private IReadOnlyList<string> mediaTypeChoices =
        DiscoverLayoutEditing.MediaTypeChoices(DiscoverRowKind.CustomKinds[0]).Select(choice => choice.Label).ToList();

    [ObservableProperty]
    private int mediaTypeIndex;

    public bool ShowsMediaType => MediaTypeChoices.Count > 0;

    /// <summary>A TMDb list's number or link, or a Trakt link.</summary>
    public bool ShowsLink => SelectedKind == DiscoverRowKind.TmdbList || SelectedKind == DiscoverRowKind.TraktList;

    public string LinkHeader => SelectedKind == DiscoverRowKind.TraktList ? Loc.Get("DiscoverSettings_TraktLinkHeader") : Loc.Get("DiscoverSettings_TmdbLinkHeader");

    public string LinkPlaceholder => SelectedKind == DiscoverRowKind.TraktList
        ? "https://trakt.tv/users/someone/lists/favourites"
        : Loc.Get("DiscoverSettings_TmdbLinkPlaceholder");

    /// <summary>A Trakt row stays empty until Trakt is connected.</summary>
    public bool ShowsTraktNote => SelectedKind == DiscoverRowKind.TraktList && settings is { TraktConfigured: false };

    public string TraktNote => Loc.Get("DiscoverSettings_TraktNote");

    [ObservableProperty]
    private string link = "";

    /// <summary>The row's name; blank lets the server name it after what it shows.</summary>
    [ObservableProperty]
    private string newTitle = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(AddLabel), nameof(CanAdd))]
    private bool isAdding;

    /// <summary>Why the row wasn't added, in the server's words.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasAddError))]
    private string? addError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasAddNotice))]
    private string? addNotice;

    public bool HasAddError => AddError != null;
    public bool HasAddNotice => AddNotice != null;
    public string AddLabel => IsAdding ? Loc.Get("DiscoverSettings_Adding") : Loc.Get("DiscoverSettings_AddRow");
    public bool CanAdd => !IsAdding;

    partial void OnKindIndexChanged(int value)
    {
        AddError = null;
        AddNotice = null;
        SearchError = null;
        SetResults([]);
        SearchText = "";
        // Through −1 so the ComboBox shows the first choice even when the
        // index was already 0 before its items changed.
        var choices = DiscoverLayoutEditing.MediaTypeChoices(SelectedKind);
        MediaTypeIndex = -1;
        MediaTypeChoices = choices.Select(choice => choice.Label).ToList();
        MediaTypeIndex = 0;
        if (SelectedKind == DiscoverRowKind.Genre)
        {
            _ = SearchAsync(immediately: true);
        }
    }

    partial void OnMediaTypeIndexChanged(int value)
    {
        // Genres differ between movies and series.
        if (SelectedKind == DiscoverRowKind.Genre)
        {
            _ = SearchAsync(immediately: true);
        }
    }

    partial void OnSearchTextChanged(string value)
    {
        if (ShowsSearch)
        {
            _ = SearchAsync(immediately: false);
        }
    }

    private ShelfMediaType? SelectedMediaType
    {
        get
        {
            var choices = DiscoverLayoutEditing.MediaTypeChoices(SelectedKind);
            return choices.Count == 0 ? null : choices[Math.Clamp(MediaTypeIndex, 0, choices.Count - 1)];
        }
    }

    /// <summary>
    /// <c>GET /settings/discover/lookup</c> for the search box, a moment
    /// after typing stops; a genre row lists every genre of its media type.
    /// </summary>
    private async Task SearchAsync(bool immediately)
    {
        searchCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        searchCancellation = cancellation;
        var token = cancellation.Token;
        if (DiscoverLayoutEditing.LookupKind(SelectedKind) is not { } lookup)
        {
            return;
        }
        var query = SearchText.Trim();
        if (lookup != DiscoverLookupKind.Genre && lookup != DiscoverLookupKind.Network && query.Length == 0)
        {
            SetResults([]);
            return;
        }
        try
        {
            if (!immediately)
            {
                await Task.Delay(SearchDelay, token);
            }
            IsSearching = true;
            SearchError = null;
            var found = await model.Api.DiscoverSettings.LookupAsync(lookup, query, SelectedMediaType, token);
            if (!token.IsCancellationRequested)
            {
                SetResults(found);
            }
        }
        catch (OperationCanceledException)
        {
            return;
        }
        catch (ApiException failure)
        {
            if (!failure.IsCancellation && !token.IsCancellationRequested)
            {
                SearchError = failure.Message;
                SetResults([]);
            }
        }
        finally
        {
            if (!token.IsCancellationRequested)
            {
                IsSearching = false;
            }
        }
    }

    private void SetResults(IReadOnlyList<DiscoverLookupResult> found)
    {
        results = found;
        ResultIndex = -1;
        ResultLabels = found.Select(result => result.Label).ToList();
    }

    /// <summary>"Add row" (<c>POST /settings/discover/shelves</c>): a new row at the end, shown; the form clears.</summary>
    [RelayCommand]
    private async Task AddAsync()
    {
        if (!CanAdd)
        {
            return;
        }
        AddNotice = null;
        var (request, refusal) = DiscoverLayoutEditing.AddRowRequest(SelectedKind, Picked, SelectedMediaType, Link, NewTitle);
        if (request == null)
        {
            AddError = refusal;
            return;
        }
        IsAdding = true;
        AddError = null;
        try
        {
            var added = await model.Api.DiscoverSettings.AddShelfAsync(request);
            AddNotice = Loc.Format("DiscoverSettings_Added", added.Title);
            Link = "";
            NewTitle = "";
            SearchText = "";
            if (SelectedKind != DiscoverRowKind.Genre)
            {
                SetResults([]);
            }
            else
            {
                ResultIndex = -1;
            }
            await LoadAsync();
        }
        catch (ApiException failure)
        {
            AddError = failure.Message;
        }
        finally
        {
            IsAdding = false;
        }
    }
}
