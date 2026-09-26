using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// app/search/page.tsx: the results for one query, grouped people, studios,
/// titles, then the genre/keyword theme row. Without a query (the Search
/// section itself) the page only offers the search box.
/// </summary>
public sealed partial class SearchViewModel : ObservableObject
{
    public const string ErrorTitle = "Couldn't search";

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

    /// <summary>All four sections came back empty.</summary>
    [ObservableProperty]
    private bool isEmpty;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasPeople))]
    private IReadOnlyList<PersonItem> people = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasStudios))]
    private IReadOnlyList<ChipItem> studios = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasTitles))]
    [NotifyPropertyChangedFor(nameof(HasResults))]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    private IReadOnlyList<PosterItem> titles = [];

    /// <summary>"Science Fiction movies &amp; TV", the theme row's heading.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasTheme))]
    private string? themeTitle;

    [ObservableProperty]
    private IReadOnlyList<PosterItem> themeItems = [];

    /// <summary>True once an answer arrived: the sections (or the empty state) may draw.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasResults))]
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
    }

    public bool HasQuery => Query.Length > 0;

    /// <summary>"Results for “keanu”", or the section title without a query.</summary>
    public string Heading => HasQuery ? $"Results for “{Query}”" : "Search";

    public string EmptyMessage => $"No results for “{Query}”.";

    public bool HasError => ErrorMessage != null;
    public bool HasResults => HasAnswer;
    public bool ShowsError => HasError && !HasAnswer;
    public bool HasPeople => People.Count > 0;
    public bool HasStudios => Studios.Count > 0;
    public bool HasTitles => Titles.Count > 0;
    public bool HasTheme => ThemeTitle != null;

    private bool IsAdmin => model.Viewer?.IsAdmin == true;

    public string TmdbMissingMessage => IsAdmin
        ? "Every poster, search result, and title page comes from TMDb. Add a free API key or read access token in Settings → Integrations."
        : "The household admin hasn't connected TMDb yet.";

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
            People = [];
            Studios = [];
            Titles = [];
            ThemeItems = [];
            ThemeTitle = null;
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
        People = results.People
            .Select(person => new PersonItem(model, person.TmdbId, person.Name, person.KnownForDepartment, person.ProfilePath, person.Favorited))
            .ToList();
        Studios = results.Studios
            .Select(studio => new ChipItem(studio.Name, new RelayCommand(() => model.OpenCompany(studio.TmdbId))))
            .ToList();
        Titles = results.Titles.Select(card => new PosterItem(card, OpenTitleCommand, showsTypeLabel: true)).ToList();
        if (results.Theme is { Items.Count: > 0 } theme)
        {
            ThemeItems = theme.Items.Select(card => new PosterItem(card, OpenTitleCommand, showsTypeLabel: true)).ToList();
            ThemeTitle = $"{theme.Label} movies & TV";
        }
        else
        {
            ThemeItems = [];
            ThemeTitle = null;
        }
        IsEmpty = results.IsEmpty;
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
    private void OpenSettings() => model.OpenSettings(SettingsTab.Integrations);

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
