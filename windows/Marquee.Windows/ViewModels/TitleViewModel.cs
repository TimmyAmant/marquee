using System.ComponentModel;
using System.Globalization;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;

namespace Marquee.Windows.ViewModels;

/// <summary>A season row in the "Episodes" accordion; its episodes load when it is first expanded.</summary>
public sealed partial class SeasonItem : ObservableObject
{
    private readonly TitleViewModel owner;

    [ObservableProperty]
    private bool isExpanded;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasEpisodes))]
    [NotifyPropertyChangedFor(nameof(IsEmpty))]
    private IReadOnlyList<EpisodeItem>? episodes;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsEmpty))]
    private bool isLoadingEpisodes;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasEpisodeError))]
    [NotifyPropertyChangedFor(nameof(IsEmpty))]
    private string? episodeError;

    public SeasonItem(TitleViewModel owner, SeasonSummary season)
    {
        this.owner = owner;
        SeasonNumber = season.SeasonNumber;
        Name = season.Name;
        // "3/10", green once every episode has a file; nothing when Sonarr doesn't track the show.
        CompletenessLabel = season.CompletenessLabel ?? "";
        CompletenessTone = season.IsComplete ? BadgeTone.Owned : BadgeTone.Tracked;
        DetailLine = string.Join(" · ", new[]
        {
            Format.Count(season.EpisodeCount, "episode", "episodes"),
            season.AirDate is { } aired ? Format.MediumDate(aired) : null,
        }.OfType<string>());
    }

    public int SeasonNumber { get; }
    public string Name { get; }
    public string CompletenessLabel { get; }
    public BadgeTone CompletenessTone { get; }

    /// <summary>"10 episodes · Sep 2, 2024".</summary>
    public string DetailLine { get; }

    public bool HasEpisodes => Episodes is { Count: > 0 };
    public bool HasEpisodeError => EpisodeError != null;

    /// <summary>Loaded, and TMDb had no episodes: "No episode data for this season."</summary>
    public bool IsEmpty => Episodes is { Count: 0 } && !IsLoadingEpisodes && EpisodeError == null;

    partial void OnIsExpandedChanged(bool value)
    {
        if (value)
        {
            _ = owner.LoadSeasonAsync(this);
        }
    }
}

/// <summary>One episode row: still, "3. Name", code and air date, Sonarr's file state, the clamped overview.</summary>
public sealed class EpisodeItem
{
    private readonly Uri? stillUrl;
    private ImageSource? still;

    public EpisodeItem(Episode episode, int seasonNumber)
    {
        Heading = $"{episode.EpisodeNumber.ToString(CultureInfo.CurrentCulture)}. {episode.Name}";
        MetaLine = string.Join(" · ", new[]
        {
            episode.Code(seasonNumber),
            episode.AirDate is { } aired ? Format.MediumDate(aired) : null,
        }.OfType<string>());
        FileLabel = episode.HasFile switch
        {
            true => "Have it",
            false => "Missing",
            null => "",
        };
        FileTone = episode.HasFile == true ? BadgeTone.Owned : BadgeTone.Neutral;
        Overview = episode.ShortOverview ?? "";
        stillUrl = episode.StillPath.Url(ImageSize.W342);
    }

    public string Heading { get; }

    /// <summary>"S01E03 · Sep 2, 2024".</summary>
    public string MetaLine { get; }

    /// <summary>"Have it" / "Missing", or empty when Sonarr doesn't track the show.</summary>
    public string FileLabel { get; }

    public BadgeTone FileTone { get; }
    public string Overview { get; }
    public bool HasStill => stillUrl != null;
    public ImageSource? Still => stillUrl == null ? null : still ??= new BitmapImage(stillUrl);
}

/// <summary>
/// app/title/[type]/[id]/page.tsx: one <c>GET /titles/{type}/{id}</c> plus
/// the actions the server says this viewer may take. After an action the
/// page refreshes only <c>library</c> + <c>viewer</c> (<c>GET …/status</c>)
/// instead of refetching everything, so the page never re-scrolls under
/// the viewer. The Mac's <c>TitleDetailModel</c>.
///
/// Everything the page shows is derived from <see cref="detail"/>; the
/// lists are built once per full load and announced together, the way
/// <c>ConnectViewModel</c> announces its derived properties.
/// </summary>
public sealed partial class TitleViewModel : ObservableObject
{
    public const string ErrorTitle = "Couldn't load this title";
    public const string SearchQueuedMessage = "Search queued.";

    /// <summary>What changes after a full load.</summary>
    private static readonly string[] DetailProperties =
    [
        nameof(HasDetail),
        nameof(Name),
        nameof(MetaLine),
        nameof(HasMetaLine),
        nameof(Tagline),
        nameof(HasTagline),
        nameof(Overview),
        nameof(HasOverview),
        nameof(Poster),
        nameof(HasPoster),
        nameof(Backdrop),
        nameof(HasBackdrop),
        nameof(Credits),
        nameof(HasCredits),
        nameof(Keywords),
        nameof(HasKeywords),
        nameof(Links),
        nameof(HasLinks),
        nameof(Facts),
        nameof(HasFacts),
        nameof(RatingLabel),
        nameof(HasRating),
        nameof(Providers),
        nameof(HasProviders),
        nameof(FileCells),
        nameof(HasFile),
        nameof(FilePath),
        nameof(HasFilePath),
        nameof(Seasons),
        nameof(HasSeasons),
        nameof(Cast),
        nameof(HasCast),
        nameof(FranchiseTitle),
        nameof(FranchiseItems),
        nameof(HasFranchise),
        nameof(MissingCount),
        nameof(AddAllLabel),
        nameof(ShowsAddAll),
        nameof(AddAllConfirmation),
        nameof(RequestableCount),
        nameof(RequestAllLabel),
        nameof(ShowsRequestAll),
        nameof(RequestAllConfirmation),
        nameof(Studios),
        nameof(HasStudios),
        nameof(Similar),
        nameof(HasSimilar),
    ];

    /// <summary>What changes after a status refresh (the action area and the badge).</summary>
    private static readonly string[] StatusProperties =
    [
        nameof(StatusLabel),
        nameof(StatusTone),
        nameof(ShowsRequested),
        nameof(RequestedLine),
        nameof(CanRequest),
        nameof(ShowsRequestMoreSeasons),
        nameof(OpensSeasonPicker),
        nameof(CanAdd),
        nameof(AddLabel),
        nameof(HasTracking),
        nameof(MonitorLabel),
        nameof(CanRelink),
        nameof(NeedsArrSetup),
        nameof(ArrSetupLabel),
        nameof(OtherRequestersLine),
        nameof(HasOtherRequesters),
        nameof(IsFavorited),
        nameof(FavoriteGlyph),
        nameof(FavoriteLabel),
        nameof(HasFourKRow),
        nameof(FourKStatusLabel),
        nameof(HasFourKStatus),
        nameof(ShowsFourKRequested),
        nameof(CanRequestFourK),
        nameof(CanAddFourK),
        nameof(CanReport),
        nameof(ShowsProblemReported),
        nameof(ReportButtonLabel),
        nameof(ShowsBlockedPill),
        nameof(ShowsNotFound),
        nameof(NotFoundTooltip),
        nameof(BlockedLine),
        nameof(ShowsBlockedByKeyword),
        nameof(BlockedKeywordLine),
        nameof(CanBlock),
        nameof(CanUnblock),
    ];

    private readonly AppModel model;
    private CancellationTokenSource? loadCancellation;
    private bool active;
    private TitleDetail? detail;

    /// <summary>A report sent from this page: "Problem reported" shows even before <c>openReports</c> catches up.</summary>
    private bool reportSent;

    // Built once per full load.
    private Uri? posterUrl;
    private Uri? backdropUrl;
    private ImageSource? poster;
    private ImageSource? backdrop;
    private IReadOnlyList<FactRow> credits = [];
    private IReadOnlyList<LinkItem> links = [];
    private IReadOnlyList<FactRow> facts = [];
    private IReadOnlyList<ProviderItem> providers = [];
    private IReadOnlyList<FactRow> fileCells = [];
    private IReadOnlyList<SeasonItem> seasons = [];
    private IReadOnlyList<PersonItem> cast = [];
    private IReadOnlyList<PosterItem> franchiseItems = [];
    private IReadOnlyList<ChipItem> studios = [];
    private IReadOnlyList<PosterItem> similar = [];

    [ObservableProperty]
    private bool isLoading;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    private string? errorMessage;

    /// <summary>Request and Add share one busy flag: the website shows one button or the other.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(RequestLabel))]
    [NotifyPropertyChangedFor(nameof(AddLabel))]
    [NotifyPropertyChangedFor(nameof(IsIdle))]
    private bool isAdding;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasAddError))]
    private string? addError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SearchLabel))]
    private bool isSearching;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(MonitorLabel))]
    private bool isTogglingMonitor;

    /// <summary>The Sonarr/Radarr row's outcome: "Search queued." or an error.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasTrackingMessage))]
    private string? trackingMessage;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(TrackingSeverity))]
    private bool trackingIsError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(AddAllLabel))]
    [NotifyPropertyChangedFor(nameof(CanAddAll))]
    private bool isAddingAll;

    /// <summary>"Added all 3" / "Added 2 of 3, 1 failed" in place of the Add all button.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasAddAllResult))]
    [NotifyPropertyChangedFor(nameof(ShowsAddAll))]
    private string? addAllResult;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(RequestAllLabel))]
    [NotifyPropertyChangedFor(nameof(CanRequestAll))]
    private bool isRequestingAll;

    /// <summary>The server's "Requested 2 of 4. …" in place of the Request all button.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasRequestAllResult))]
    [NotifyPropertyChangedFor(nameof(ShowsRequestAll))]
    private string? requestAllResult;

    [ObservableProperty]
    private bool isTogglingFavorite;

    /// <summary>"Request in 4K" and "Add to 4K …" share one busy flag, as components/fourk-controls.tsx.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(RequestFourKLabel))]
    [NotifyPropertyChangedFor(nameof(AddFourKLabel))]
    private bool isFourKBusy;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasFourKError))]
    private string? fourKError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(UnblockLabel))]
    private bool isUnblocking;

    public TitleViewModel(AppModel model)
    {
        this.model = model;
        AddAdvanced = new AddOverridesViewModel(() => model.Api, Id.MediaType, Id.TmdbId, is4k: false);
        AddFourKAdvanced = new AddOverridesViewModel(() => model.Api, Id.MediaType, Id.TmdbId, is4k: true);
        // An older server has no add options: neither section shows again.
        AddAdvanced.Unsupported = () => AddFourKAdvanced.IsUnsupported = true;
        AddFourKAdvanced.Unsupported = () => AddAdvanced.IsUnsupported = true;
    }

    /// <summary>"Advanced" under the admin's Add (0.43+): which server, and its settings.</summary>
    public AddOverridesViewModel AddAdvanced { get; }

    /// <summary>"Advanced" under Add to 4K (0.43+): which 4K server, and its settings.</summary>
    public AddOverridesViewModel AddFourKAdvanced { get; }

    /// <summary>The title this page shows; a placeholder until <see cref="Activate"/> says which.</summary>
    public TitleId Id { get; private set; } = new(MediaType.Movie, 0);

    public bool HasError => ErrorMessage != null;
    public bool ShowsError => HasError && !HasDetail;

    /// <summary>The page on the server's website opens in the browser (https only, see <see cref="ExternalLinks"/>).</summary>
    public bool CanOpenInBrowser => WebUrl != null;

    private Uri? WebUrl
    {
        get
        {
            var url = model.WebUrl(new Route.Title(Id));
            return ExternalLinks.CanOpen(url) ? url : null;
        }
    }

    // MARK: Derived from the detail

    public bool HasDetail => detail != null;
    public string Name => detail?.Name ?? "";

    /// <summary>"2h 16m · Action, Science Fiction · 1999" under the name.</summary>
    public string MetaLine => detail is { } current
        ? string.Join(" · ", new[]
        {
            current.Facts.RuntimeLabel.NonBlank(),
            current.Facts.Genres.Count > 0 ? string.Join(", ", current.Facts.Genres) : null,
            current.Facts.YearRange.NonBlank(),
        }.OfType<string>())
        : "";

    public bool HasMetaLine => MetaLine.Length > 0;
    public string Tagline => detail?.Tagline.NonBlank() ?? "";
    public bool HasTagline => Tagline.Length > 0;
    public string Overview => detail?.Overview.NonBlank() ?? "";
    public bool HasOverview => Overview.Length > 0;

    public bool HasPoster => posterUrl != null;
    public ImageSource? Poster => posterUrl == null ? null : poster ??= new BitmapImage(posterUrl);
    public bool HasBackdrop => backdropUrl != null;
    public ImageSource? Backdrop => backdropUrl == null ? null : backdrop ??= new BitmapImage(backdropUrl);

    /// <summary>Director, writers (or creator, executive producers): the label is the role, the value the name.</summary>
    public IReadOnlyList<FactRow> Credits => credits;

    public bool HasCredits => credits.Count > 0;
    public string Keywords => detail == null ? "" : string.Join(" · ", detail.Keywords);
    public bool HasKeywords => Keywords.Length > 0;
    public IReadOnlyList<LinkItem> Links => links;
    public bool HasLinks => links.Count > 0;
    public IReadOnlyList<FactRow> Facts => facts;
    public bool HasFacts => facts.Count > 0;
    public string RatingLabel => detail?.Facts.RatingPercent is { } rating ? $"★ {rating.ToString(CultureInfo.CurrentCulture)}%" : "";
    public bool HasRating => RatingLabel.Length > 0;
    public IReadOnlyList<ProviderItem> Providers => providers;
    public bool HasProviders => providers.Count > 0;
    public IReadOnlyList<FactRow> FileCells => fileCells;
    public bool HasFile => detail?.Library.File != null;
    public string FilePath => detail?.Library.File?.Path.NonBlank() ?? "";
    public bool HasFilePath => FilePath.Length > 0;
    public IReadOnlyList<SeasonItem> Seasons => seasons;
    public bool HasSeasons => seasons.Count > 0;
    public IReadOnlyList<PersonItem> Cast => cast;
    public bool HasCast => cast.Count > 0;
    public string FranchiseTitle => detail?.Franchise?.Title ?? "";
    public IReadOnlyList<PosterItem> FranchiseItems => franchiseItems;
    public bool HasFranchise => franchiseItems.Count > 0;
    public int MissingCount => detail?.Franchise?.AddAllMissing.Count ?? 0;
    public string AddAllLabel => IsAddingAll ? "Adding…" : $"Add all {MissingCount.ToString(CultureInfo.CurrentCulture)} missing";
    public bool ShowsAddAll => MissingCount > 0 && AddAllResult == null;
    public bool HasAddAllResult => AddAllResult != null;

    public string AddAllConfirmation =>
        $"Add all {MissingCount.ToString(CultureInfo.CurrentCulture)} missing {(MissingCount == 1 ? "title" : "titles")} to Sonarr/Radarr?";

    /// <summary>A member's "Request all N missing" (franchise.requestAllMissing).</summary>
    public int RequestableCount => detail?.Franchise?.RequestAllCount ?? 0;
    public string RequestAllLabel => TitleFranchise.RequestAllLabel(RequestableCount, IsRequestingAll);
    public bool ShowsRequestAll => RequestableCount > 0 && RequestAllResult == null;
    public bool HasRequestAllResult => RequestAllResult != null;
    public string RequestAllConfirmation => TitleFranchise.RequestAllConfirmation(RequestableCount);

    public IReadOnlyList<ChipItem> Studios => studios;
    public bool HasStudios => studios.Count > 0;
    public IReadOnlyList<PosterItem> Similar => similar;
    public bool HasSimilar => similar.Count > 0;

    // MARK: Derived from library + viewer (refreshed after every action)

    private TitleViewerState? Viewer => detail?.Viewer;

    /// <summary>The big badge; a status this app doesn't know renders nothing rather than a raw wire value.</summary>
    public string StatusLabel => detail?.Library.Status is { IsKnown: true } status ? status.Label : "";

    public BadgeTone StatusTone => detail?.Library.Status is { IsKnown: true } status ? PosterItem.ToneFor(status) : BadgeTone.Neutral;

    /// <summary>The website's "Requested" pill (waiting for approval) in place of the Request button.</summary>
    public bool ShowsRequested => Viewer?.AlreadyRequested == true;

    /// <summary>"Requested Seasons 1–3, waiting for approval", or without the seasons for a whole-series request.</summary>
    public string RequestedLine => Viewer?.PendingRequestLine ?? "";

    /// <summary>What the Request button does; <see cref="TitleRequestAction.None"/> until the page has loaded.</summary>
    private TitleRequestAction RequestAction => detail?.RequestAction ?? TitleRequestAction.None;

    /// <summary>The accent "Request": whole series, or the season picker on a TV show the server offers seasons for.</summary>
    public bool CanRequest => RequestAction is TitleRequestAction.WholeSeries or TitleRequestAction.PickSeasons;

    /// <summary>"Request more seasons" on a show that's already tracked or partly requested.</summary>
    public bool ShowsRequestMoreSeasons => RequestAction == TitleRequestAction.PickMoreSeasons;

    /// <summary>Request opens the season picker (the page shows it) instead of requesting the whole series.</summary>
    public bool OpensSeasonPicker => RequestAction is TitleRequestAction.PickSeasons or TitleRequestAction.PickMoreSeasons;

    /// <summary>Every season TMDb lists, in the accordion's order, for the picker.</summary>
    public IReadOnlyList<SeasonSummary> PickerSeasons => detail?.Seasons ?? [];

    public string RequestLabel => IsAdding ? "Requesting…" : "Request";

    /// <summary>Nothing in flight in the action area: the Request buttons (which use Click, not a command) can be pressed.</summary>
    public bool IsIdle => !IsAdding;
    public bool CanAdd => Viewer?.CanAdd == true;
    public string AddLabel => IsAdding ? "Adding…" : $"Add to {Id.MediaType.ArrName}";
    public bool HasTracking => Viewer?.ArrTracking != null;
    public string SearchLabel => IsSearching ? "Searching…" : "Search now";

    public string MonitorLabel => IsTogglingMonitor
        ? "Updating…"
        : Viewer?.ArrTracking?.Monitored == true ? "Stop monitoring" : "Start monitoring";

    public bool CanRelink => Viewer?.CanRelink == true;
    public bool NeedsArrSetup => Viewer?.NeedsArrSetup == true;
    public string ArrSetupLabel => $"Connect {Id.MediaType.ArrName} to add this title";
    public string OtherRequestersLine => Viewer?.OtherRequestersLine ?? "";
    public bool HasOtherRequesters => OtherRequestersLine.Length > 0;
    public bool IsFavorited => Viewer?.Favorited == true;
    public string FavoriteGlyph => FavoriteGlyphs.For(IsFavorited);
    public string FavoriteLabel => FavoriteGlyphs.Label(IsFavorited);
    public bool HasAddError => AddError != null;
    public bool HasTrackingMessage => TrackingMessage != null;

    /// <summary>The Sonarr/Radarr row's InfoBar: green for "Search queued.", red for a failure.</summary>
    public InfoBarSeverity TrackingSeverity => TrackingIsError ? InfoBarSeverity.Error : InfoBarSeverity.Success;

    /// <summary>"Add all N missing" is one click at a time.</summary>
    public bool CanAddAll => !IsAddingAll;

    /// <summary>So is "Request all N missing".</summary>
    public bool CanRequestAll => !IsRequestingAll;

    // MARK: 4K (viewer.fourK, 0.37+; components/fourk-controls.tsx)

    private FourKViewerState? FourK => Viewer?.FourK;

    /// <summary>The admin has a 4K Radarr/Sonarr for this type: the 4K row shows.</summary>
    public bool HasFourKRow => FourK != null && (HasFourKStatus || ShowsFourKRequested || CanRequestFourK || CanAddFourK);

    /// <summary>The gold outline chip: "In 4K", "4K downloading", "4K missing", "4K coming soon"; empty when untracked.</summary>
    public string FourKStatusLabel => FourK?.StatusLabel ?? "";

    public bool HasFourKStatus => FourKStatusLabel.Length > 0;

    /// <summary>"4K requested" while your 4K request is pending.</summary>
    public bool ShowsFourKRequested => FourK?.IsRequested == true;

    public bool CanRequestFourK => FourK?.CanRequest == true && !ShowsFourKRequested;
    public bool CanAddFourK => FourK?.CanAdd == true;
    public string RequestFourKLabel => IsFourKBusy ? "Requesting…" : "Request in 4K";
    public string AddFourKLabel => IsFourKBusy ? "Adding…" : $"Add to 4K {Id.MediaType.ArrName}";
    public bool HasFourKError => FourKError != null;

    // MARK: Problem reports (viewer.canReport / openReports, 0.38+; components/report-problem-button.tsx)

    /// <summary>"Report a problem": the title (or its 4K copy) is owned or downloading. An older server never says so.</summary>
    public bool CanReport => Viewer?.CanReport == true;

    /// <summary>The "Problem reported" pill before the button: one sent from here, or one of yours still open.</summary>
    public bool ShowsProblemReported => CanReport && (reportSent || Viewer?.OpenReports > 0);

    /// <summary>Another episode can still be reported while one report is open.</summary>
    public string ReportButtonLabel => ShowsProblemReported ? "Report another" : "Report a problem";

    /// <summary>The show's seasons, for the Report dialog's picker; empty for a movie.</summary>
    public IReadOnlyList<int> ReportSeasonNumbers => detail?.Seasons.Select(season => season.SeasonNumber).ToList() ?? [];

    /// <summary>
    /// The Report dialog's submit (<c>POST …/issues</c>). Throws
    /// <see cref="ApiException"/> for the dialog to show inline; on success
    /// the pill shows and the status block is re-read.
    /// </summary>
    public async Task ReportProblemAsync(ReportIssueBody body)
    {
        await model.Api.Issues.ReportAsync(Id.MediaType, Id.TmdbId, body);
        reportSent = true;
        OnPropertyChanged(nameof(ShowsProblemReported));
        OnPropertyChanged(nameof(ReportButtonLabel));
        await RefreshStatusAsync();
    }

    // MARK: Can't find (viewer.notFoundSince, 0.46+, reviewers only; components/title-hero.tsx)

    /// <summary>The red "Can't find" badge next to the library status: Sonarr/Radarr hasn't found the approved request.</summary>
    public bool ShowsNotFound => Viewer?.NotFoundSince != null;

    /// <summary>"Sonarr/Radarr hasn't found it since Sep 18, 2026".</summary>
    public string NotFoundTooltip => Viewer?.NotFoundSince is { } since
        ? $"Sonarr/Radarr hasn't found it since {Format.ShortDate(since)}. See Can't find on the Requests page."
        : "";

    // MARK: Request blocklist (viewer.blocked, 0.41+; components/block-requests-button.tsx)

    private TitleBlock? Blocked => Viewer?.Blocked;
    private bool ViewerIsAdmin => Viewer?.IsAdmin == true;

    /// <summary>A member's "Requests are closed for this title — reason" in place of Request.</summary>
    public bool ShowsBlockedPill => Blocked != null && !ViewerIsAdmin;

    public string BlockedLine => Blocked?.MemberLine ?? "";

    /// <summary>The admin's "Requests blocked by “anime”": a keyword did it, so it's unblocked from Settings.</summary>
    public bool ShowsBlockedByKeyword => ViewerIsAdmin && Blocked?.KeywordLine != null;

    public string BlockedKeywordLine => Blocked?.KeywordLine ?? "";

    /// <summary>The admin's "Block requests"; hidden on a server older than the blocklist.</summary>
    public bool CanBlock => ViewerIsAdmin && Viewer?.HasBlocklist == true && Blocked == null;

    /// <summary>The admin's "Unblock requests" on a title blocked from its own page.</summary>
    public bool CanUnblock => ViewerIsAdmin && Blocked != null && Blocked.KeywordLine == null;

    public string UnblockLabel => IsUnblocking ? "Unblocking…" : "Unblock requests";

    /// <summary>
    /// The Block dialog's submit (<c>POST …/block</c>, with the optional
    /// reason). Throws <see cref="ApiException"/> for the dialog to show
    /// inline; on success the status block is re-read.
    /// </summary>
    public async Task BlockAsync(string? reason)
    {
        await model.Api.Blocklist.BlockTitleAsync(Id.MediaType, Id.TmdbId, reason);
        await RefreshStatusAsync();
    }

    /// <summary>"Unblock requests" (<c>DELETE …/block</c>).</summary>
    [RelayCommand]
    private async Task UnblockAsync()
    {
        if (IsUnblocking)
        {
            return;
        }
        IsUnblocking = true;
        AddError = null;
        try
        {
            await model.Api.Blocklist.UnblockTitleAsync(Id.MediaType, Id.TmdbId);
            await RefreshStatusAsync();
        }
        catch (ApiException error)
        {
            AddError = error.Message;
        }
        finally
        {
            IsUnblocking = false;
        }
    }

    // MARK: Lifecycle

    /// <summary>The page is on screen for <paramref name="id"/>: follow reloads and fetch (once) the detail.</summary>
    public void Activate(TitleId id)
    {
        if (active && id == Id)
        {
            return;
        }
        if (active)
        {
            Deactivate();
        }
        if (id != Id)
        {
            Id = id;
            Clear();
        }
        active = true;
        model.PropertyChanged += OnModelPropertyChanged;
        model.Events.Changed += OnServerChanged;
        if (detail == null)
        {
            _ = LoadAsync();
        }
    }

    /// <summary>Back to nothing: the page was re-targeted at another title.</summary>
    private void Clear()
    {
        detail = null;
        reportSent = false;
        posterUrl = null;
        backdropUrl = null;
        poster = null;
        backdrop = null;
        credits = [];
        links = [];
        facts = [];
        providers = [];
        fileCells = [];
        seasons = [];
        cast = [];
        franchiseItems = [];
        studios = [];
        similar = [];
        ErrorMessage = null;
        AddError = null;
        FourKError = null;
        TrackingMessage = null;
        AddAllResult = null;
        RequestAllResult = null;
        AddAdvanced.Reset(Id.MediaType, Id.TmdbId);
        AddFourKAdvanced.Reset(Id.MediaType, Id.TmdbId);
        foreach (var name in DetailProperties)
        {
            OnPropertyChanged(name);
        }
        foreach (var name in StatusProperties)
        {
            OnPropertyChanged(name);
        }
        OnPropertyChanged(nameof(CanOpenInBrowser));
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

    /// <summary>The full page; also "Try again". Only F5 refetches an already loaded page.</summary>
    [RelayCommand]
    private async Task LoadAsync()
    {
        loadCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        loadCancellation = cancellation;
        var token = cancellation.Token;

        IsLoading = detail == null;
        ErrorMessage = null;
        try
        {
            var fresh = await model.Api.Titles.DetailAsync(Id.MediaType, Id.TmdbId, token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            AddAllResult = null;
            RequestAllResult = null;
            SetDetail(fresh, rebuild: true);
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            if (detail == null)
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

    /// <summary>
    /// The cheap refresh after an action, or after something else on the
    /// server moved the library/requests counters: <c>library</c> + <c>viewer</c>
    /// only. A no-op until the page has loaded; a failure leaves the page as it was.
    /// </summary>
    private async Task RefreshStatusAsync()
    {
        if (detail == null)
        {
            return;
        }
        try
        {
            var status = await model.Api.Titles.StatusAsync(Id.MediaType, Id.TmdbId);
            // Posters of this title elsewhere (Discover, a grid behind this
            // page) drop a stale "+ Add" / "Request" and take the new badge.
            model.TitleState.StatusChanged(status.Id, status.Library.Status, status.Viewer.AlreadyRequested);
            if (detail is { } latest && latest.Id == status.Id)
            {
                SetDetail(latest.Updating(status), rebuild: false);
            }
        }
        catch (ApiException)
        {
            // The action's own error is already showing, or the next poll refreshes.
        }
    }

    private void SetDetail(TitleDetail fresh, bool rebuild)
    {
        detail = fresh;
        if (rebuild)
        {
            Build(fresh);
            foreach (var name in DetailProperties)
            {
                OnPropertyChanged(name);
            }
        }
        foreach (var name in StatusProperties)
        {
            OnPropertyChanged(name);
        }
    }

    /// <summary>Everything static about the title, shaped for the page's bindings.</summary>
    private void Build(TitleDetail fresh)
    {
        // w500 for the poster, w1280 for the backdrop: the widest window at
        // 2x is covered, and an "original" backdrop decodes to tens of megabytes.
        posterUrl = fresh.PosterPath.Url(ImageSize.W500);
        backdropUrl = fresh.BackdropPath.Url(ImageSize.W1280);
        poster = null;
        backdrop = null;

        credits = fresh.Credits.Select(credit => new FactRow(credit.Role, credit.Name)).ToList();

        var linkItems = new List<LinkItem>();
        if (LinkItem.Https("▶ Trailer", fresh.Links.TrailerUrl) is { } trailer)
        {
            linkItems.Add(trailer);
        }
        foreach (var external in fresh.Links.External)
        {
            if (LinkItem.Https(external.Label, external.Link) is { } item)
            {
                linkItems.Add(item);
            }
        }
        links = linkItems;

        facts = BuildFacts(fresh);
        providers = fresh.Facts.WatchProviders.Select(provider => new ProviderItem(provider)).ToList();
        fileCells = fresh.Library.File is { } file ? BuildFileCells(file, fresh.Facts.RuntimeLabel) : [];
        seasons = fresh.Seasons.Select(season => new SeasonItem(this, season)).ToList();
        cast = fresh.Cast
            .Select(member => new PersonItem(model, member.TmdbId, member.Name, member.Character, member.ProfilePath, member.Favorited))
            .ToList();
        franchiseItems = fresh.Franchise?.Items.Select(card => new PosterItem(model, card, OpenTitleCommand)).ToList() ?? [];
        studios = fresh.Studios
            .Select(studio => new ChipItem(studio.Name, new RelayCommand(() => model.OpenCompany(studio.TmdbId)), studio.ChipLogoUrl()))
            .ToList();
        similar = fresh.Similar.Select(card => new PosterItem(model, card, OpenTitleCommand, showsTypeLabel: true)).ToList();
    }

    /// <summary>The facts card's rows, in the website's order; rows the server didn't fill are left out.</summary>
    private static IReadOnlyList<FactRow> BuildFacts(TitleDetail fresh)
    {
        var facts = fresh.Facts;
        var country = facts.ProductionCountry is { } place ? $"{place.Flag} {place.Name}" : null;
        (string Label, string? Value)[] candidates =
        [
            ("Status", facts.StatusLabel),
            (fresh.MediaType == MediaType.Movie ? "Release Date" : "First Air Date", facts.ReleaseDateLabel),
            ("Next Episode", facts.NextAirDateLabel),
            ("Original Language", facts.OriginalLanguageLabel),
            ("Production Country", country),
            ("Network", facts.Network),
        ];
        return candidates
            .Where(candidate => candidate.Value.NonBlank() != null)
            .Select(candidate => new FactRow(candidate.Label, candidate.Value!))
            .ToList();
    }

    /// <summary>components/file-details-section.tsx's pairs; anything the server didn't send is skipped.</summary>
    private static IReadOnlyList<FactRow> BuildFileCells(FileDetails file, string? runtimeLabel)
    {
        var cells = new List<FactRow> { new("Size", file.SizeLabel) };
        void Add(string label, string? value)
        {
            if (value.NonBlank() is { } text)
            {
                cells.Add(new FactRow(label, text));
            }
        }

        Add("Runtime", runtimeLabel);
        Add("Added", file.DateAdded is { } added ? Format.ShortDate(added) : null);
        Add("Resolution", file.ResolutionLabel);
        Add("Quality profile", file.Quality);
        Add("Video", file.VideoCodec);
        Add("Dynamic range", file.DynamicRangeLabel);
        Add("Audio", file.AudioLabel);
        Add("Container", file.Container);
        Add("Bitrate", file.BitrateLabel);
        Add("Edition", file.Edition);
        Add("Release group", file.ReleaseGroup);
        return cells;
    }

    // MARK: Seasons

    /// <summary>Called by a season row when it expands; asks once per row.</summary>
    public async Task LoadSeasonAsync(SeasonItem season)
    {
        if (season.Episodes != null || season.IsLoadingEpisodes)
        {
            return;
        }
        season.IsLoadingEpisodes = true;
        season.EpisodeError = null;
        try
        {
            var fresh = await model.Api.Titles.SeasonAsync(season.SeasonNumber, Id.TmdbId);
            season.Episodes = fresh.Episodes.Select(episode => new EpisodeItem(episode, fresh.SeasonNumber)).ToList();
        }
        catch (ApiException error)
        {
            season.EpisodeError = error.Message;
        }
        finally
        {
            season.IsLoadingEpisodes = false;
        }
    }

    // MARK: Actions

    /// <summary>"Request" (<c>POST …/request</c>); the server may auto-approve it.</summary>
    [RelayCommand]
    private async Task RequestAsync()
    {
        if (IsAdding)
        {
            return;
        }
        IsAdding = true;
        AddError = null;
        try
        {
            await model.Api.Titles.RequestAsync(Id.MediaType, Id.TmdbId);
            await RefreshStatusAsync();
        }
        catch (ApiException error)
        {
            AddError = error.Message;
        }
        finally
        {
            IsAdding = false;
        }
    }

    /// <summary>
    /// The season picker's submit (<c>POST …/request</c> with <c>seasons</c>).
    /// Throws <see cref="ApiException"/> for the picker to show inline; on
    /// success the whole page reloads behind it, since the per-season rows
    /// changed too (<c>…/status</c> only carries <c>library</c> + <c>viewer</c>).
    /// </summary>
    public async Task RequestSeasonsAsync(IReadOnlyList<int> seasons)
    {
        AddError = null;
        await model.Api.Titles.RequestAsync(Id.MediaType, Id.TmdbId, seasons);
        _ = LoadAsync();
    }

    /// <summary>
    /// "Add to Radarr/Sonarr" (<c>POST …/add</c>, admin), with the
    /// "Advanced" picks once that section was opened (0.43+).
    /// </summary>
    [RelayCommand]
    private async Task AddAsync()
    {
        if (IsAdding)
        {
            return;
        }
        IsAdding = true;
        AddError = null;
        try
        {
            if (AddAdvanced.Overrides is { } overrides)
            {
                await model.Api.Titles.AddAsync(Id.MediaType, Id.TmdbId, overrides);
            }
            else
            {
                await model.Api.Titles.AddAsync(Id.MediaType, Id.TmdbId);
            }
            await RefreshStatusAsync();
        }
        catch (ApiException error)
        {
            AddError = error.Message;
        }
        finally
        {
            IsAdding = false;
        }
    }

    /// <summary>"Request in 4K" (<c>POST …/request</c> with <c>{"is4k": true}</c>): always the whole title.</summary>
    [RelayCommand]
    private Task RequestFourKAsync() =>
        RunFourKAsync(() => model.Api.Titles.RequestFourKAsync(Id.MediaType, Id.TmdbId));

    /// <summary>"Add to 4K Radarr/Sonarr" (<c>POST …/add</c> with <c>{"is4k": true}</c>, admin).</summary>
    /// <remarks>With the 4K "Advanced" picks once that section was opened (0.43+).</remarks>
    [RelayCommand]
    private Task AddFourKAsync()
    {
        var overrides = AddFourKAdvanced.Overrides;
        return RunFourKAsync(() => overrides is { } picked
            ? model.Api.Titles.AddAsync(Id.MediaType, Id.TmdbId, picked, is4k: true)
            : model.Api.Titles.AddFourKAsync(Id.MediaType, Id.TmdbId));
    }

    private async Task RunFourKAsync(Func<Task> action)
    {
        if (IsFourKBusy)
        {
            return;
        }
        IsFourKBusy = true;
        FourKError = null;
        try
        {
            await action();
            await RefreshStatusAsync();
        }
        catch (ApiException error)
        {
            FourKError = error.Message;
        }
        finally
        {
            IsFourKBusy = false;
        }
    }

    /// <summary>"Search now": queues a Radarr/Sonarr search. Website text: "Search queued."</summary>
    [RelayCommand]
    private async Task SearchNowAsync()
    {
        if (IsSearching)
        {
            return;
        }
        IsSearching = true;
        TrackingMessage = null;
        try
        {
            await model.Api.Titles.SearchNowAsync(Id.MediaType, Id.TmdbId);
            TrackingIsError = false;
            TrackingMessage = SearchQueuedMessage;
        }
        catch (ApiException error)
        {
            TrackingIsError = true;
            TrackingMessage = error.Message;
        }
        finally
        {
            IsSearching = false;
        }
    }

    /// <summary>"Stop monitoring" / "Start monitoring".</summary>
    [RelayCommand]
    private async Task ToggleMonitorAsync()
    {
        if (IsTogglingMonitor || Viewer?.ArrTracking is not { } tracking)
        {
            return;
        }
        IsTogglingMonitor = true;
        TrackingMessage = null;
        try
        {
            await model.Api.Titles.SetMonitoredAsync(!tracking.Monitored, Id.MediaType, Id.TmdbId);
            await RefreshStatusAsync();
        }
        catch (ApiException error)
        {
            TrackingIsError = true;
            TrackingMessage = error.Message;
        }
        finally
        {
            IsTogglingMonitor = false;
        }
    }

    /// <summary>The star next to the name: an explicit PUT or DELETE, then the status block is re-read.</summary>
    [RelayCommand]
    private async Task ToggleFavoriteAsync()
    {
        if (IsTogglingFavorite || detail == null)
        {
            return;
        }
        IsTogglingFavorite = true;
        AddError = null;
        try
        {
            await model.Api.Favorites.SetAsync(!IsFavorited, FavoriteEntityType.Of(Id.MediaType), Id.TmdbId);
            await RefreshStatusAsync();
        }
        catch (ApiException error)
        {
            AddError = error.Message;
        }
        finally
        {
            IsTogglingFavorite = false;
        }
    }

    /// <summary>The franchise row's "Add all N missing", one title at a time like the website.</summary>
    [RelayCommand]
    private async Task AddAllMissingAsync()
    {
        if (IsAddingAll || detail?.Franchise?.AddAllMissing is not { Count: > 0 } targets)
        {
            return;
        }
        IsAddingAll = true;
        AddAllResult = null;
        var failures = 0;
        try
        {
            foreach (var target in targets)
            {
                try
                {
                    await model.Api.Titles.AddAsync(target.MediaType, target.TmdbId);
                }
                catch (ApiException)
                {
                    failures++;
                }
            }
            var total = targets.Count.ToString(CultureInfo.CurrentCulture);
            AddAllResult = failures > 0
                ? $"Added {(targets.Count - failures).ToString(CultureInfo.CurrentCulture)} of {total}, {failures.ToString(CultureInfo.CurrentCulture)} failed"
                : $"Added all {total}";
        }
        finally
        {
            IsAddingAll = false;
        }
        // The whole page, not just this title's status: the collection's
        // posters need their new badges, and "Add all" its new count.
        await ReloadKeepingAddAllResultAsync();
    }

    /// <summary>
    /// The franchise row's "Request all N missing" (household members): one
    /// call, the server requests each title and says how it went.
    /// </summary>
    [RelayCommand]
    private async Task RequestAllMissingAsync()
    {
        if (IsRequestingAll || RequestableCount == 0)
        {
            return;
        }
        IsRequestingAll = true;
        RequestAllResult = null;
        try
        {
            RequestAllResult = (await model.Api.Titles.RequestAllMissingAsync(Id.MediaType, Id.TmdbId)).Message;
        }
        catch (ApiException error)
        {
            RequestAllResult = error.Message;
        }
        finally
        {
            IsRequestingAll = false;
        }
        // The whole page, like "Add all": the posters show Requested now.
        await ReloadKeepingAddAllResultAsync();
    }

    /// <summary>A quiet full refetch after "Add all" or "Request all" that keeps their result lines.</summary>
    private async Task ReloadKeepingAddAllResultAsync()
    {
        try
        {
            var fresh = await model.Api.Titles.DetailAsync(Id.MediaType, Id.TmdbId);
            if (detail is { } latest && latest.Id == fresh.Id)
            {
                var result = AddAllResult;
                var requestResult = RequestAllResult;
                SetDetail(fresh, rebuild: true);
                AddAllResult = result;
                RequestAllResult = requestResult;
            }
        }
        catch (ApiException)
        {
            await RefreshStatusAsync();
        }
    }

    /// <summary>"Wrong match? Fix ID": repoints the title; the page navigates to the id it returns.</summary>
    public Task<int> RelinkAsync(RelinkTarget target) =>
        model.Api.Titles.RelinkAsync(Id.MediaType, Id.TmdbId, target);

    [RelayCommand]
    private async Task OpenInBrowserAsync()
    {
        await ExternalLinks.OpenAsync(WebUrl);
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
            _ = LoadAsync();
        }
    }

    /// <summary>
    /// A change that came from the server (a download finished, someone
    /// requested this from the website) refreshes the status block; this
    /// app's own actions already did.
    /// </summary>
    private void OnServerChanged(object? sender, ServerChangedEventArgs e)
    {
        if (e.Source != ServerChangeSource.Server || (e.Change & (ServerChange.Library | ServerChange.Requests)) == ServerChange.None)
        {
            return;
        }
        model.Dispatcher.TryEnqueue(() =>
        {
            if (active)
            {
                _ = RefreshStatusAsync();
            }
        });
    }
}
