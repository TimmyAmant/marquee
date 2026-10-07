using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// app/company/[id]/page.tsx + components/company-header.tsx: the logo,
/// "{n} titles in the catalog", the description and the catalog as a
/// filterable grid.
/// </summary>
public sealed partial class CompanyViewModel : ObservableObject
{
    public static string EmptyTitles => Loc.Get("Company_EmptyTitles");
    public static string EmptyNetworkTitles => Loc.Get("Network_EmptyTitles");

    private readonly AppModel model;
    private CancellationTokenSource? loadCancellation;
    private bool active;
    private Uri? logoUrl;
    private ImageSource? logo;

    [ObservableProperty]
    private bool isLoading;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    [NotifyPropertyChangedFor(nameof(ShowsInlineError))]
    private string? errorMessage;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasCompany))]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    [NotifyPropertyChangedFor(nameof(ShowsInlineError))]
    [NotifyPropertyChangedFor(nameof(Name))]
    [NotifyPropertyChangedFor(nameof(CountLine))]
    [NotifyPropertyChangedFor(nameof(Description))]
    [NotifyPropertyChangedFor(nameof(HasDescription))]
    [NotifyPropertyChangedFor(nameof(Logo))]
    [NotifyPropertyChangedFor(nameof(HasLogo))]
    private CompanyDetail? company;

    [ObservableProperty]
    private MediaListViewModel? titles;

    /// <summary>The best-known title's backdrop behind the header, with "From …"; null keeps the plain header.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasHero))]
    private EntityHeroItem? hero;

    /// <summary>IMDb, socials, website: pills under the text (components/external-links.tsx).</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasLinks))]
    private IReadOnlyList<LinkItem> links = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FavoriteGlyph))]
    [NotifyPropertyChangedFor(nameof(FavoriteLabel))]
    private bool isFavorited;

    [ObservableProperty]
    private bool isTogglingFavorite;

    public CompanyViewModel(AppModel model)
    {
        this.model = model;
    }

    /// <summary>The studio this page shows; 0 until <see cref="Activate"/> says which.</summary>
    public int TmdbId { get; private set; }

    /// <summary>A TV network's page (app/network/[id]): no favorite.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsFavorite))]
    private bool isNetwork;

    public bool ShowsFavorite => !IsNetwork;

    public bool HasCompany => Company != null;
    public bool ShowsError => ErrorMessage != null && !HasCompany;

    /// <summary>A failure (a star that didn't stick) while the page is up: a bar in the header, not the empty state.</summary>
    public bool ShowsInlineError => ErrorMessage != null && HasCompany;
    public string Name => Company?.Name ?? "";

    /// <summary>"137 titles in the catalog".</summary>
    public string CountLine => Company is { } current ? Loc.Plural("Company_TitlesInCatalog", current.TitleCount) : "";

    public string Description => Company?.ShortDescription ?? "";
    public bool HasDescription => Description.Length > 0;
    public bool HasLogo => logoUrl != null;
    public ImageSource? Logo => logoUrl == null ? null : logo ??= new BitmapImage(logoUrl);
    public bool HasHero => Hero != null;
    public bool HasLinks => Links.Count > 0;
    public string FavoriteGlyph => FavoriteGlyphs.For(IsFavorited);
    public string FavoriteLabel => FavoriteGlyphs.Label(IsFavorited);

    // MARK: Lifecycle

    /// <summary>The page is on screen for <paramref name="tmdbId"/>: follow reloads and fetch (once).</summary>
    public void Activate(int tmdbId, bool isNetwork = false)
    {
        if (active && tmdbId == TmdbId && isNetwork == IsNetwork)
        {
            return;
        }
        if (active)
        {
            Deactivate();
        }
        if (tmdbId != TmdbId || isNetwork != IsNetwork)
        {
            TmdbId = tmdbId;
            IsNetwork = isNetwork;
            logoUrl = null;
            logo = null;
            Titles = null;
            Hero = null;
            Links = [];
            IsFavorited = false;
            ErrorMessage = null;
            Company = null;
        }
        active = true;
        model.PropertyChanged += OnModelPropertyChanged;
        model.Events.Changed += OnServerChanged;
        if (Company == null)
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
        loadCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        loadCancellation = cancellation;
        var token = cancellation.Token;

        IsLoading = Company == null;
        ErrorMessage = null;
        try
        {
            var fresh = IsNetwork
                ? await model.Api.Companies.NetworkAsync(TmdbId, token)
                : await model.Api.Companies.DetailAsync(TmdbId, token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            logoUrl = fresh.LogoPath.Url(ImageSize.W342);
            logo = null;
            IsFavorited = fresh.Favorited;
            Titles = new MediaListViewModel(model, fresh.Titles, MediaListNoun.Title, IsNetwork ? EmptyNetworkTitles : EmptyTitles);
            Hero = EntityHeroItem.For(model, fresh.KnownForTitle);
            Links = EntityLinkItems.From(fresh.Links);
            Company = fresh;
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            if (IsNetwork && Company == null && error.Kind == ApiErrorKind.NotFound)
            {
                // A server older than 0.76 has no network pages: the Series
                // grid filtered to the network, as before.
                model.Browse(MediaType.Tv, networkId: TmdbId);
                return;
            }
            if (Company == null)
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

    // MARK: Actions

    [RelayCommand]
    private async Task ToggleFavoriteAsync()
    {
        if (IsTogglingFavorite || Company == null)
        {
            return;
        }
        var wanted = !IsFavorited;
        IsTogglingFavorite = true;
        IsFavorited = wanted;
        try
        {
            IsFavorited = await model.Api.Favorites.SetAsync(wanted, FavoriteEntityType.Company, TmdbId);
        }
        catch (ApiException error)
        {
            IsFavorited = !wanted;
            ErrorMessage = error.Message;
        }
        finally
        {
            IsTogglingFavorite = false;
        }
    }

    // MARK: Reload triggers

    private void OnModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(AppModel.ReloadToken))
        {
            _ = LoadAsync();
        }
    }

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
