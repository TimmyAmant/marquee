using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// app/search/page.tsx: the results for one query in sections, always
/// Movies, TV Shows, People, then Studios &amp; Networks (each with its total
/// and See all), and the genre/keyword theme row first or last. Without a query (the Search
/// section itself) the page only offers the search box.
/// </summary>
public sealed partial class SearchViewModel : ObservableObject
{
    private readonly AppModel model;
    private CancellationTokenSource? loadCancellation;
    private bool active;

    [ObservableProperty]
    private bool isLoading;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    private string? errorMessage;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(TmdbMissingMessage))]
    [NotifyPropertyChangedFor(nameof(CanOpenSettings))]
    private bool isTmdbMissing;

    /// <summary>Every section, and the theme row, came back empty.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasAnyResults))]
    private bool isEmpty;

    /// <summary>"Science Fiction movies &amp; TV", the theme row's heading.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ThemeFirst))]
    [NotifyPropertyChangedFor(nameof(ThemeLast))]
    private string? themeTitle;

    /// <summary>The query names a person ("tom hanks"): People comes before the titles.</summary>
    [ObservableProperty]
    private bool peopleFirst;

    /// <summary>The query is the theme itself ("horror"): its row leads the page.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ThemeFirst))]
    [NotifyPropertyChangedFor(nameof(ThemeLast))]
    private bool themeLeads;

    [ObservableProperty]
    private IReadOnlyList<PosterItem> themeItems = [];

    /// <summary>True once an answer arrived: the sections (or the empty state) may draw.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasResults))]
    [NotifyPropertyChangedFor(nameof(HasAnyResults))]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    private bool hasAnswer;

    /// <summary>The query this page is for; empty for the Search section itself.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasQuery))]
    [NotifyPropertyChangedFor(nameof(Heading))]
    [NotifyPropertyChangedFor(nameof(EmptyMessage))]
    private string query = "";

    public SearchViewModel(AppModel model)
    {
        this.model = model;
        Movies = new SearchTitleSectionViewModel(model, SearchSectionName.Movies, () => Query, OpenTitleCommand);
        Series = new SearchTitleSectionViewModel(model, SearchSectionName.Series, () => Query, OpenTitleCommand);
        People = new SearchPeopleSectionViewModel(model, () => Query);
        Studios = new SearchStudioSectionViewModel(model, () => Query);
    }

    // The page's sections, always in this order (SearchPageLayout); the XAML
    // stacks them top to bottom and hides the empty ones.

    public SearchTitleSectionViewModel Movies { get; }
    public SearchTitleSectionViewModel Series { get; }
    public SearchPeopleSectionViewModel People { get; }
    public SearchStudioSectionViewModel Studios { get; }

    public bool HasQuery => Query.Length > 0;

    /// <summary>"Results for “keanu”", or the section title without a query.</summary>
    public string Heading => HasQuery ? Loc.Format("Search_ResultsFor", Query) : Loc.Get("Search_Title");

    public string EmptyMessage => Loc.Format("Search_NoResults", Query);

    public bool HasError => ErrorMessage != null;
    public bool HasResults => HasAnswer;
    public bool ShowsError => HasError && !HasAnswer;
    public bool ThemeFirst => ThemeTitle != null && ThemeLeads;
    public bool ThemeLast => ThemeTitle != null && !ThemeLeads;
    public bool HasAnyResults => HasAnswer && !IsEmpty;

    private bool IsAdmin => model.Viewer?.IsAdmin == true;

    public string TmdbMissingMessage => IsAdmin
        ? Loc.Get("Discover_TmdbMissingAdmin")
        : Loc.Get("Discover_TmdbMissingMember");

    public bool CanOpenSettings => IsTmdbMissing && IsAdmin;

    // MARK: Lifecycle

    /// <summary>The page is on screen for <paramref name="requested"/> (null or blank: the section's landing page).</summary>
    public void Activate(string? requested)
    {
        var normalized = requested?.Trim() ?? "";
        if (active && normalized == Query)
        {
            return;
        }
        if (active)
        {
            Deactivate();
        }
        if (normalized != Query)
        {
            Query = normalized;
            HasAnswer = false;
            IsEmpty = false;
            IsTmdbMissing = false;
            ErrorMessage = null;
            Movies.Reset([], 0, 0);
            Series.Reset([], 0, 0);
            People.Reset([], 0, 0);
            Studios.Reset([], 0, 0);
            ThemeItems = [];
            ThemeTitle = null;
            ThemeLeads = false;
            PeopleFirst = false;
        }
        active = true;
        model.PropertyChanged += OnModelPropertyChanged;
        model.Events.Changed += OnServerChanged;
        if (HasQuery)
        {
            _ = LoadAsync();
        }
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
        Movies.Cancel();
        Series.Cancel();
        People.Cancel();
        Studios.Cancel();
    }

    // MARK: Loading

    [RelayCommand]
    private async Task LoadAsync()
    {
        if (!HasQuery)
        {
            return;
        }
        loadCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        loadCancellation = cancellation;
        var token = cancellation.Token;

        IsLoading = !HasAnswer;
        ErrorMessage = null;
        try
        {
            var results = await model.Api.Search.ResultsAsync(Query, token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            Apply(results);
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            if (error.IsTmdbUnconfigured())
            {
                HasAnswer = false;
                IsTmdbMissing = true;
            }
            else
            {
                ErrorMessage = error.Message;
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

    private void Apply(SearchResults results)
    {
        IsTmdbMissing = false;
        // An older server has no sections: SectionsOf splits its titles into
        // movies and series, so the order is the same either way.
        var sections = SearchPageLayout.SectionsOf(results);
        Movies.Reset(
            sections.Movies.Results.Select(card => new PosterItem(model, card, OpenTitleCommand)),
            sections.Movies.TotalResults,
            sections.Movies.TotalPages);
        Series.Reset(
            sections.Series.Results.Select(card => new PosterItem(model, card, OpenTitleCommand)),
            sections.Series.TotalResults,
            sections.Series.TotalPages);
        People.Reset(
            sections.People.Results.Select(person => SearchPeopleSectionViewModel.Item(model, person)),
            sections.People.TotalResults,
            sections.People.TotalPages);
        Studios.Reset(
            sections.StudiosAndNetworks.Results.Select(company => SearchStudioSectionViewModel.Item(model, company)),
            sections.StudiosAndNetworks.TotalResults,
            sections.StudiosAndNetworks.TotalPages);
        if (results.Theme is { Items.Count: > 0 } theme)
        {
            ThemeItems = theme.Items.Select(card => new PosterItem(model, card, OpenTitleCommand, showsTypeLabel: true)).ToList();
            ThemeTitle = Loc.Format("Search_ThemeTitle", theme.Label);
            ThemeLeads = theme.LeadsPage;
        }
        else
        {
            ThemeItems = [];
            ThemeTitle = null;
            ThemeLeads = false;
        }
        PeopleFirst = results.PeopleFirst;
        IsEmpty = SearchPageLayout.Blocks(results).Count == 0;
        HasAnswer = true;
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
    private void OpenSettings() => model.OpenSettings(SettingsTab.General);

    /// <summary>The page's own search box: a new query is a new page on the stack, like the website's URL.</summary>
    [RelayCommand]
    private void Search(string? query)
    {
        if (!string.IsNullOrWhiteSpace(query))
        {
            model.Search(query);
        }
    }

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

    /// <summary>Library or favorites moved on the server: the cards' badges and stars may be stale.</summary>
    private void OnServerChanged(object? sender, ServerChangedEventArgs e)
    {
        if (e.Source != ServerChangeSource.Server || (e.Change & (ServerChange.Library | ServerChange.Favorites)) == ServerChange.None)
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
