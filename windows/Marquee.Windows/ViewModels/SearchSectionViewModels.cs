using System.Collections.ObjectModel;
using System.Globalization;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// One section of the search page (Movies, TV Shows, People or Studios &amp;
/// Networks): a heading with its total, the first cards, and "See all",
/// which shows every card loaded and then pages in more from
/// <c>GET /search/{section}</c> ("Show more") until there are none.
/// </summary>
public abstract partial class SearchSectionViewModel<TItem> : ObservableObject
{
    /// <summary>How many cards a section shows before See all.</summary>
    public const int CollapsedCount = 12;

    private readonly List<TItem> loaded = [];
    private int nextPage = 2;
    private bool serverHasMore;
    private CancellationTokenSource? pageCancellation;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CountText))]
    private int totalResults;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SeeMoreLabel))]
    private bool isExpanded;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanSeeMore))]
    private bool isLoadingMore;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasPageError))]
    private string? pageError;

    protected SearchSectionViewModel(string title)
    {
        Title = title;
    }

    /// <summary>"Movies", "TV Shows", "People", "Studios &amp; Networks".</summary>
    public string Title { get; }

    /// <summary>What's on screen.</summary>
    public ObservableCollection<TItem> Items { get; } = [];

    public bool HasItems => Items.Count > 0;

    /// <summary>The heading's count, "1,234".</summary>
    public string CountText => TotalResults.ToString("N0", CultureInfo.CurrentCulture);

    /// <summary>More than the section shows: loaded cards still hidden, or more pages on the server.</summary>
    public bool CanSeeMore => !IsLoadingMore && (loaded.Count > Items.Count || serverHasMore);

    /// <summary>"See all" at first, "Show more" once open.</summary>
    public string SeeMoreLabel => IsExpanded ? Loc.Get("Search_ShowMore") : Loc.Get("Search_SeeAll");

    public bool HasPageError => PageError != null;

    /// <summary>A new answer from <c>GET /search</c>: the section starts collapsed.</summary>
    public void Reset(IEnumerable<TItem> items, int total, int totalPages)
    {
        pageCancellation?.Cancel();
        loaded.Clear();
        loaded.AddRange(items);
        Items.Clear();
        foreach (var item in loaded.Take(CollapsedCount))
        {
            Items.Add(item);
        }
        nextPage = 2;
        serverHasMore = totalPages > 1 && total > loaded.Count;
        TotalResults = total;
        IsExpanded = false;
        IsLoadingMore = false;
        PageError = null;
        OnPropertyChanged(nameof(HasItems));
        OnPropertyChanged(nameof(CanSeeMore));
    }

    /// <summary>Stops a page still loading (the page is leaving).</summary>
    public void Cancel() => pageCancellation?.Cancel();

    /// <summary>See all / Show more.</summary>
    [RelayCommand]
    private async Task SeeMoreAsync()
    {
        IsExpanded = true;
        if (loaded.Count > Items.Count)
        {
            foreach (var item in loaded.Skip(Items.Count).ToList())
            {
                Items.Add(item);
            }
            OnPropertyChanged(nameof(CanSeeMore));
            return;
        }
        if (!serverHasMore)
        {
            return;
        }
        pageCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        pageCancellation = cancellation;
        IsLoadingMore = true;
        PageError = null;
        try
        {
            var (items, hasMore) = await LoadPageAsync(nextPage, cancellation.Token);
            if (cancellation.IsCancellationRequested)
            {
                return;
            }
            var fresh = items.Where(item => !loaded.Any(existing => SameCard(existing, item))).ToList();
            loaded.AddRange(fresh);
            foreach (var item in fresh)
            {
                Items.Add(item);
            }
            nextPage++;
            serverHasMore = hasMore;
        }
        catch (OperationCanceledException)
        {
            // Superseded by a new search.
        }
        catch (ApiException error)
        {
            if (!error.IsCancellation && !cancellation.IsCancellationRequested)
            {
                PageError = error.Message;
            }
        }
        finally
        {
            if (!cancellation.IsCancellationRequested)
            {
                IsLoadingMore = false;
            }
            OnPropertyChanged(nameof(CanSeeMore));
        }
    }

    /// <summary>One more page of this section, and whether the server has more after it.</summary>
    protected abstract Task<(IReadOnlyList<TItem> Items, bool HasMore)> LoadPageAsync(int page, CancellationToken ct);

    /// <summary>The same card again (TMDb's order shifts between pages).</summary>
    protected abstract bool SameCard(TItem a, TItem b);
}

/// <summary>Movies or TV Shows.</summary>
public sealed class SearchTitleSectionViewModel : SearchSectionViewModel<PosterItem>
{
    private readonly AppModel model;
    private readonly SearchSectionName section;
    private readonly Func<string> query;
    private readonly System.Windows.Input.ICommand openTitle;

    public SearchTitleSectionViewModel(AppModel model, SearchSectionName section, Func<string> query, System.Windows.Input.ICommand openTitle)
        : base(section == SearchSectionName.Movies ? Loc.Get("Search_Movies") : Loc.Get("Search_Series"))
    {
        this.model = model;
        this.section = section;
        this.query = query;
        this.openTitle = openTitle;
    }

    protected override async Task<(IReadOnlyList<PosterItem> Items, bool HasMore)> LoadPageAsync(int page, CancellationToken ct)
    {
        var result = await model.Api.Search.TitlesAsync(section, query(), page, ct);
        return (result.Results.Select(card => new PosterItem(model, card, openTitle)).ToList(), result.HasMorePages);
    }

    protected override bool SameCard(PosterItem a, PosterItem b) => a.Id == b.Id;
}

/// <summary>People: round photos with what they're known for.</summary>
public sealed class SearchPeopleSectionViewModel : SearchSectionViewModel<PersonItem>
{
    private readonly AppModel model;
    private readonly Func<string> query;

    public SearchPeopleSectionViewModel(AppModel model, Func<string> query)
        : base(Loc.Get("Search_PeopleHeading"))
    {
        this.model = model;
        this.query = query;
    }

    public static PersonItem Item(AppModel model, PersonCard person) =>
        new(model, person.TmdbId, person.Name, person.KnownForLine, person.ProfilePath, person.Favorited);

    protected override async Task<(IReadOnlyList<PersonItem> Items, bool HasMore)> LoadPageAsync(int page, CancellationToken ct)
    {
        var result = await model.Api.Search.PeopleAsync(query(), page, ct);
        return (result.Results.Select(person => Item(model, person)).ToList(), result.HasMorePages);
    }

    protected override bool SameCard(PersonItem a, PersonItem b) => a.TmdbId == b.TmdbId;
}

/// <summary>Studios &amp; Networks: Discover's logo tiles.</summary>
public sealed class SearchStudioSectionViewModel : SearchSectionViewModel<ChipItem>
{
    private readonly AppModel model;
    private readonly Func<string> query;

    public SearchStudioSectionViewModel(AppModel model, Func<string> query)
        : base(Loc.Get("Search_StudiosNetworks"))
    {
        this.model = model;
        this.query = query;
    }

    /// <summary>A studio opens its page; a network opens Series filtered to it.</summary>
    public static ChipItem Item(AppModel model, SearchCompanyCard company) => new(
        new ShelfTile
        {
            Kind = ShelfTileKind.Logo,
            Id = company.TmdbId,
            Name = company.Name,
            ImageUrl = company.LogoPath.Url(ImageSize.W500),
        },
        new RelayCommand(() =>
        {
            if (company.IsNetwork)
            {
                model.OpenNetwork(company.TmdbId);
            }
            else
            {
                model.OpenCompany(company.TmdbId);
            }
        }),
        company.StableId,
        company.IsNetwork ? Loc.Get("Enum_SuggestionNetwork") : Loc.Get("Enum_SuggestionStudio"));

    protected override async Task<(IReadOnlyList<ChipItem> Items, bool HasMore)> LoadPageAsync(int page, CancellationToken ct)
    {
        var result = await model.Api.Search.StudiosAsync(query(), page, ct);
        return (result.Results.Select(company => Item(model, company)).ToList(), result.HasMorePages);
    }

    protected override bool SameCard(ChipItem a, ChipItem b) => a.Key != null && a.Key == b.Key;
}
