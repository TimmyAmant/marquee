using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Globalization;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;

namespace Marquee.Windows.ViewModels;

/// <summary>The 40x56 poster thumbnail every request row shows.</summary>
public abstract class RequestRowBase
{
    private readonly Uri? posterUrl;
    private ImageSource? poster;

    protected RequestRowBase(string title, ImageRef? posterPath, DateTimeOffset createdAt, TitleId titleId, ICommand openTitle)
    {
        Title = title;
        posterUrl = posterPath.Url(ImageSize.W92);
        DateLabel = Format.ShortDate(createdAt);
        TitleId = titleId;
        Open = openTitle;
    }

    public string Title { get; }
    public string DateLabel { get; }
    public TitleId TitleId { get; }
    public bool HasPoster => posterUrl != null;
    public ImageSource? Poster => posterUrl == null ? null : poster ??= new BitmapImage(posterUrl);

    /// <summary>Runs with this row as its parameter: opens the title.</summary>
    public ICommand Open { get; }
}

/// <summary>A member's own request (requests/page.tsx's table).</summary>
public sealed class MyRequestRow : RequestRowBase
{
    public MyRequestRow(MyRequest request, ICommand openTitle)
        : base(request.Title, request.PosterPath, request.CreatedAt, request.TitleId, openTitle)
    {
        StatusLabel = request.StatusLabel;
        Tone = request.StatusTone.ToBadgeTone();
        ReasonLine = request.RejectionReason.NonBlank() is { } reason ? $"Reason: {reason}" : "";
        SeasonsLine = request.DetailText;
    }

    /// <summary>"Seasons 1–3", "Seasons 1–3 · In 4K" or "In 4K" under the title; empty for a regular whole series or movie.</summary>
    public string SeasonsLine { get; }

    public string StatusLabel { get; }
    public BadgeTone Tone { get; }

    /// <summary>"Reason: …" under a Declined badge (server 0.28.0 and later), else empty.</summary>
    public string ReasonLine { get; }
}

/// <summary>A row of "Past requests".</summary>
public sealed class ReviewedRow : RequestRowBase
{
    public ReviewedRow(ReviewedRequest request, ICommand openTitle)
        : base(request.Title, request.PosterPath, request.CreatedAt, request.TitleId, openTitle)
    {
        RequesterLabel = request.RequestedBy.Label;
        StatusLabel = request.StatusLabel;
        Tone = request.Status == RequestStatus.Approved ? BadgeTone.Owned : BadgeTone.Neutral;
        ReasonLine = request.RejectionReason.NonBlank() is { } reason ? $"Reason: {reason}" : "";
        SeasonsLine = request.DetailText;
    }

    /// <summary>"Seasons 1–3" and/or "In 4K" (joined with " · ") under the title; empty for a regular whole series or movie.</summary>
    public string SeasonsLine { get; }

    public string RequesterLabel { get; }
    public string StatusLabel { get; }
    public BadgeTone Tone { get; }
    public string ReasonLine { get; }
}

/// <summary>
/// components/request-review-row.tsx: one pending request with Approve,
/// Reject and, after Sonarr couldn't resolve the show, Manually approve.
/// The two error slots are separate like the web's per-button states, so a
/// later Reject error doesn't hide the manual-approve path.
/// </summary>
public sealed partial class PendingRow : ObservableObject
{
    private readonly RequestsViewModel owner;
    private readonly Uri? posterUrl;
    private readonly Uri? manualSonarrUrl;
    private ImageSource? poster;

    /// <summary>"approve", "reject" or "manual" while that call is in flight.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsBusy))]
    [NotifyPropertyChangedFor(nameof(CanAct))]
    [NotifyPropertyChangedFor(nameof(ApproveLabel))]
    [NotifyPropertyChangedFor(nameof(RejectLabel))]
    [NotifyPropertyChangedFor(nameof(ManualLabel))]
    private string? busy;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(Error))]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? approveError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(Error))]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? otherError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsApprove))]
    [NotifyPropertyChangedFor(nameof(CanAddManually))]
    private bool showManualApprove;

    public PendingRow(RequestsViewModel owner, PendingRequest request, Uri? manualSonarrUrl, ICommand openTitle)
    {
        this.owner = owner;
        Id = request.Id;
        Title = request.Title;
        TitleId = request.TitleId;
        RequesterLabel = request.RequestedBy.Label;
        DateLabel = Format.ShortDate(request.CreatedAt);
        SeasonsLine = request.DetailText;
        posterUrl = request.PosterPath.Url(ImageSize.W92);
        // Only an https Sonarr can be opened from here (see ExternalLinks).
        this.manualSonarrUrl = ExternalLinks.CanOpen(manualSonarrUrl) ? manualSonarrUrl : null;
        Open = openTitle;
    }

    public Guid Id { get; }
    public string Title { get; }
    public TitleId TitleId { get; }
    public string RequesterLabel { get; }
    public string DateLabel { get; }

    /// <summary>"Seasons 1–3" and/or "In 4K" (joined with " · ") under the title; empty for a regular whole series or movie.</summary>
    public string SeasonsLine { get; }

    public bool HasPoster => posterUrl != null;
    public ImageSource? Poster => posterUrl == null ? null : poster ??= new BitmapImage(posterUrl);
    public ICommand Open { get; }

    public bool IsBusy => Busy != null;
    public bool CanAct => Busy == null;
    public string ApproveLabel => Busy == "approve" ? "Approving…" : "Approve";
    public string RejectLabel => Busy == "reject" ? "Rejecting…" : "Reject";
    public string ManualLabel => Busy == "manual" ? "Approving…" : "Manually approve";

    /// <summary>Approve gives way to Manually approve once Sonarr couldn't resolve the show.</summary>
    public bool ShowsApprove => !ShowManualApprove;

    public string? Error => ApproveError ?? OtherError;
    public bool HasError => Error != null;

    /// <summary>"Add manually in Sonarr": the manual path plus a Sonarr this app can open.</summary>
    public bool CanAddManually => ShowManualApprove && manualSonarrUrl != null;

    /// <summary><c>POST /requests/{id}/approve</c>; "Couldn't resolve this show for Sonarr." offers the manual path.</summary>
    [RelayCommand]
    private Task ApproveAsync() => RunAsync("approve", api => api.Requests.ApproveAsync(Id));

    /// <summary>Reject is a two-step, like the web row: the chooser first, and only its Decline sends anything.</summary>
    [RelayCommand]
    private async Task RejectAsync()
    {
        if (IsBusy)
        {
            return;
        }
        var reason = await owner.ChooseReasonAsync(this);
        if (reason == null)
        {
            return;
        }
        await RunAsync("reject", api => api.Requests.RejectAsync(Id, reason));
    }

    /// <summary><c>POST /requests/{id}/manual-approve</c>: approved without touching Sonarr.</summary>
    [RelayCommand]
    private Task ManuallyApproveAsync() => RunAsync("manual", api => api.Requests.ManuallyApproveAsync(Id));

    [RelayCommand]
    private async Task AddManuallyAsync()
    {
        await ExternalLinks.OpenAsync(manualSonarrUrl);
    }

    private async Task RunAsync(string label, Func<MarqueeApi, Task> action)
    {
        if (IsBusy)
        {
            return;
        }
        Busy = label;
        OtherError = null;
        if (label == "approve")
        {
            ApproveError = null;
        }
        try
        {
            await action(owner.Api);
            // Hide immediately, like the web row: no second click window while the list reloads.
            owner.Settle(this);
        }
        catch (ApiException error)
        {
            if (label == "approve")
            {
                ApproveError = error.Message;
                if (error.IsSonarrUnresolvable)
                {
                    ShowManualApprove = true;
                }
            }
            else
            {
                OtherError = error.Message;
            }
        }
        finally
        {
            Busy = null;
        }
    }
}

/// <summary>
/// components/issues-section.tsx's card: one problem report. Open ones have
/// "Search again", "Mark fixed" (which opens a note field and its own "Mark
/// fixed") and "Remove" for the admin, "Withdraw" for the member's own.
/// </summary>
public sealed partial class IssueRow : ObservableObject
{
    public const string SearchingMessage = "Searching for another copy…";

    private readonly RequestsViewModel owner;
    private readonly Uri? posterUrl;
    private readonly bool isAdmin;
    private readonly bool isMine;
    private ImageSource? poster;

    /// <summary>"search", "resolve" or "delete" while that call is in flight.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanAct))]
    [NotifyPropertyChangedFor(nameof(SearchLabel))]
    [NotifyPropertyChangedFor(nameof(ResolveLabel))]
    private string? busy;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    /// <summary>"Searching for another copy…" after Search again.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasInfo))]
    private string? info;

    /// <summary>The note field and its "Mark fixed" are open.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsAdminActions))]
    private bool isResolving;

    /// <summary>The note for the reporter (optional, up to 500 characters).</summary>
    [ObservableProperty]
    private string note = "";

    public IssueRow(RequestsViewModel owner, Issue issue, bool isAdmin, System.Windows.Input.ICommand openTitle)
    {
        this.owner = owner;
        this.isAdmin = isAdmin;
        isMine = issue.IsMine;
        Id = issue.Id;
        Title = issue.Title;
        TitleId = issue.TitleId;
        IsOpen = issue.IsOpen;
        EpisodeLabel = issue.EpisodeLabel.NonBlank() ?? "";
        // "Audio problem · Member · Sep 26, 2026": the reporter only for the admin.
        MetaLine = string.Join(" · ", new[]
        {
            issue.KindText,
            isAdmin ? issue.ReportedBy.Label : null,
            Format.ShortDate(issue.CreatedAt),
        }.OfType<string>());
        MessageLine = issue.Message.NonBlank() is { } message ? $"“{message}”" : "";
        FixedLine = issue.FixedLine;
        posterUrl = issue.PosterPath.Url(ImageSize.W92);
        Open = openTitle;
    }

    public Guid Id { get; }
    public string Title { get; }
    public TitleId TitleId { get; }
    public bool IsOpen { get; }

    /// <summary>"S2 E5", "Season 2", "Specials", or empty.</summary>
    public string EpisodeLabel { get; }

    public string MetaLine { get; }

    /// <summary>The reporter's note in quotes, or empty.</summary>
    public string MessageLine { get; }

    /// <summary>"Fixed: Replaced the file" once fixed, else empty.</summary>
    public string FixedLine { get; }

    public bool HasPoster => posterUrl != null;
    public ImageSource? Poster => posterUrl == null ? null : poster ??= new BitmapImage(posterUrl);
    public System.Windows.Input.ICommand Open { get; }

    public bool CanAct => Busy == null;
    public bool HasError => Error != null;
    public bool HasInfo => Info != null;

    /// <summary>"Search again" and "Mark fixed": the admin, on an open report, until the note field opens.</summary>
    public bool ShowsAdminActions => isAdmin && IsOpen && !IsResolving;

    /// <summary>"Withdraw" your own open report, or (admin) "Remove" any open one.</summary>
    public bool ShowsRemove => IsOpen && (isMine || isAdmin);

    public string RemoveLabel => isMine && !isAdmin ? "Withdraw" : "Remove";
    public string SearchLabel => Busy == "search" ? "Searching…" : "Search again";
    public string ResolveLabel => Busy == "resolve" ? "Saving…" : "Mark fixed";

    /// <summary><c>POST /issues/{id}/search</c>: Radarr/Sonarr looks for another copy.</summary>
    [RelayCommand]
    private Task SearchAgainAsync() => RunAsync("search", api => api.Issues.SearchAgainAsync(Id), SearchingMessage);

    /// <summary>The first "Mark fixed": opens the note field.</summary>
    [RelayCommand]
    private void StartResolving() => IsResolving = true;

    /// <summary>The note field's "Mark fixed" (<c>POST /issues/{id}/resolve</c>): the reporter is told.</summary>
    [RelayCommand]
    private Task ResolveAsync() => RunAsync("resolve", api => api.Issues.ResolveAsync(Id, Note));

    /// <summary><c>DELETE /issues/{id}</c>: Withdraw / Remove.</summary>
    [RelayCommand]
    private Task RemoveAsync() => RunAsync("delete", api => api.Issues.DeleteAsync(Id));

    /// <summary>
    /// Runs one action. Resolve and Remove reload the list (the mutation
    /// does); a report that is already gone ("That report isn't open any
    /// more.") reloads rather than showing an error.
    /// </summary>
    private async Task RunAsync(string label, Func<MarqueeApi, Task> action, string? after = null)
    {
        if (Busy != null)
        {
            return;
        }
        Busy = label;
        Error = null;
        Info = null;
        try
        {
            await action(owner.Api);
            Info = after;
        }
        catch (ApiException failure)
        {
            if (failure.Kind == ApiErrorKind.NotFound && label != "search")
            {
                owner.ReloadIssues();
            }
            else
            {
                Error = failure.Message;
            }
        }
        finally
        {
            Busy = null;
        }
    }
}

/// <summary>
/// app/requests/page.tsx: a member's own requests, or the admin's review
/// queue plus "Past requests". Reloads on F5, after any request changed
/// (this app's own approvals included, so a settled row's replacement
/// arrives) and when the library moved on the server.
/// </summary>
public sealed partial class RequestsViewModel : ObservableObject
{
    public const string MemberEmptyMessage = "You haven't requested anything yet. Find a title and hit Request.";
    public const string QueueEmptyMessage = "No pending requests.";
    public const string QueueLoadingMessage = "Checking requests against your library…";

    private readonly AppModel model;
    private CancellationTokenSource? loadCancellation;
    private bool active;

    /// <summary>
    /// Set by the page: shows the "Decline request" dialog for a row and
    /// returns the chosen reason, or null when the admin cancelled. A
    /// ContentDialog needs the page's XamlRoot, which is why it isn't here.
    /// </summary>
    public Func<PendingRow, Task<string?>>? ReasonChooser { get; set; }

    /// <summary>
    /// The review queue, history and "Reported problems": the admin's and
    /// (0.39+) trusted members'. Everyone else sees their own requests.
    /// </summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsMember))]
    [NotifyPropertyChangedFor(nameof(IssuesHeading))]
    private bool reviews;

    // MARK: Member

    /// <summary>
    /// "Movies: 3 of 5 requests left (every 7 days) · TV: none left until
    /// Oct 3" above a member's requests; empty (collapsed) when nothing is
    /// limited or the server predates limits.
    /// </summary>
    [ObservableProperty]
    private string limitsLine = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasMine))]
    [NotifyPropertyChangedFor(nameof(IsMineEmpty))]
    [NotifyPropertyChangedFor(nameof(ShowsMineError))]
    private IReadOnlyList<MyRequestRow>? mine;

    [ObservableProperty]
    private bool isMineLoading;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsMineError))]
    private string? mineError;

    // MARK: Admin

    public ObservableCollection<PendingRow> Pending { get; } = [];

    /// <summary>The queue has answered at least once.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsQueueEmpty))]
    [NotifyPropertyChangedFor(nameof(ShowsQueueError))]
    [NotifyPropertyChangedFor(nameof(ShowsApproveAll))]
    private bool hasQueue;

    [ObservableProperty]
    private bool isQueueLoading;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsQueueError))]
    private string? queueError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsQueueEmpty))]
    [NotifyPropertyChangedFor(nameof(HasPending))]
    [NotifyPropertyChangedFor(nameof(ShowsApproveAll))]
    private int pendingCount;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ApproveAllLabel))]
    [NotifyPropertyChangedFor(nameof(ShowsApproveAll))]
    private bool isApprovingAll;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasApproveAllMessage))]
    [NotifyPropertyChangedFor(nameof(ShowsApproveAll))]
    private string? approveAllMessage;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ApproveAllSeverity))]
    private bool approveAllIsError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasHistory))]
    [NotifyPropertyChangedFor(nameof(ShowsHistoryError))]
    [NotifyPropertyChangedFor(nameof(ShowsHistorySection))]
    private IReadOnlyList<ReviewedRow> history = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsHistoryError))]
    [NotifyPropertyChangedFor(nameof(ShowsHistorySection))]
    private string? historyError;

    /// <summary>The server's preset reasons (empty on a server before 0.28.0; the dialog then uses its own list).</summary>
    public IReadOnlyList<string> RejectionReasons { get; private set; } = [];

    // MARK: Problem reports (GET /issues, 0.38+; components/issues-section.tsx)

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsIssues))]
    [NotifyPropertyChangedFor(nameof(HasOpenIssues))]
    [NotifyPropertyChangedFor(nameof(IsOpenIssuesEmpty))]
    private IReadOnlyList<IssueRow> openIssues = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsIssues))]
    [NotifyPropertyChangedFor(nameof(IsOpenIssuesEmpty))]
    [NotifyPropertyChangedFor(nameof(HasFixedIssues))]
    [NotifyPropertyChangedFor(nameof(ShowsFixedIssues))]
    [NotifyPropertyChangedFor(nameof(ShowFixedLabel))]
    private IReadOnlyList<IssueRow> fixedIssues = [];

    /// <summary>The fixed ones behind "Show fixed (N)" are open.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsFixedIssues))]
    [NotifyPropertyChangedFor(nameof(ShowFixedLabel))]
    private bool isShowingFixed;

    public RequestsViewModel(AppModel model)
    {
        this.model = model;
        Reviews = model.Viewer?.ReviewsRequests == true;
        Pending.CollectionChanged += (_, _) => PendingCount = Pending.Count;
    }

    public bool IsMember => !Reviews;
    public bool HasMine => Mine is { Count: > 0 };
    public bool IsMineEmpty => Mine is { Count: 0 };
    public bool ShowsMineError => MineError != null && Mine == null;

    public bool HasPending => PendingCount > 0;
    public bool IsQueueEmpty => HasQueue && PendingCount == 0;
    public bool ShowsQueueError => QueueError != null && !HasQueue;

    /// <summary>"Approve all" only when more than one is pending (and while its outcome shows).</summary>
    public bool ShowsApproveAll => HasQueue && (PendingCount > 1 || IsApprovingAll || ApproveAllMessage != null);

    public string ApproveAllLabel => IsApprovingAll ? "Approving…" : "Approve all";
    public bool HasApproveAllMessage => ApproveAllMessage != null;
    public InfoBarSeverity ApproveAllSeverity => ApproveAllIsError ? InfoBarSeverity.Error : InfoBarSeverity.Success;
    public bool HasHistory => History.Count > 0;

    /// <summary>"Past requests" failed and there is nothing older to keep showing.</summary>
    public bool ShowsHistoryError => HistoryError != null && History.Count == 0;

    /// <summary>The "Past requests" heading: there are rows, or a failure to report.</summary>
    public bool ShowsHistorySection => HasHistory || ShowsHistoryError;

    /// <summary>The section shows once there's any report, open or fixed; an older server has none.</summary>
    public bool ShowsIssues => OpenIssues.Count > 0 || FixedIssues.Count > 0;

    public string IssuesHeading => Reviews ? "Reported problems" : "Your problem reports";
    public bool HasOpenIssues => OpenIssues.Count > 0;

    /// <summary>"Nothing open right now." when only fixed ones are left.</summary>
    public bool IsOpenIssuesEmpty => ShowsIssues && OpenIssues.Count == 0;

    public bool HasFixedIssues => FixedIssues.Count > 0;
    public bool ShowsFixedIssues => IsShowingFixed && HasFixedIssues;

    public string ShowFixedLabel => IsShowingFixed
        ? "Hide fixed"
        : $"Show fixed ({FixedIssues.Count.ToString(CultureInfo.CurrentCulture)})";

    internal MarqueeApi Api => model.Api;

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
        _ = LoadAsync();
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
        if (Reviews)
        {
            await LoadQueueAsync(token);
            if (!token.IsCancellationRequested)
            {
                await LoadHistoryAsync(token);
            }
        }
        else
        {
            await LoadMineAsync(token);
            if (!token.IsCancellationRequested)
            {
                await LoadLimitsAsync(token);
            }
        }
        if (!token.IsCancellationRequested)
        {
            await LoadIssuesAsync(token);
        }
    }

    /// <summary>
    /// "Reported problems" / "Your problem reports". An older server has no
    /// <c>/issues</c> (404): the section stays hidden. Any other failure
    /// keeps what's shown; the next reload tries again.
    /// </summary>
    private async Task LoadIssuesAsync(CancellationToken token)
    {
        try
        {
            var fresh = await model.Api.Issues.ListAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            OpenIssues = fresh.Open.Select(issue => new IssueRow(this, issue, Reviews, OpenIssueTitleCommand)).ToList();
            FixedIssues = fresh.Fixed.Select(issue => new IssueRow(this, issue, Reviews, OpenIssueTitleCommand)).ToList();
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            if (error.Kind == ApiErrorKind.NotFound)
            {
                OpenIssues = [];
                FixedIssues = [];
            }
        }
    }

    /// <summary>A row's report was already gone: the server's view replaces the list.</summary>
    internal void ReloadIssues()
    {
        if (active)
        {
            _ = LoadAsync();
        }
    }

    [RelayCommand]
    private void ToggleFixedIssues() => IsShowingFixed = !IsShowingFixed;

    [RelayCommand]
    private void OpenIssueTitle(IssueRow? row)
    {
        if (row != null)
        {
            model.OpenTitle(row.TitleId);
        }
    }

    /// <summary>
    /// <c>requestLimits</c> from <c>/me</c> (0.39+; an older server omits
    /// it, so the line stays hidden). A failure keeps what's shown.
    /// </summary>
    private async Task LoadLimitsAsync(CancellationToken token)
    {
        try
        {
            var me = await model.Api.MeAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            LimitsLine = me.ReviewsRequests ? "" : me.RequestLimits?.Summary() ?? "";
        }
        catch (ApiException)
        {
            // The requests themselves are what matters; the next reload tries again.
        }
    }

    private async Task LoadMineAsync(CancellationToken token)
    {
        IsMineLoading = Mine == null;
        try
        {
            var fresh = await model.Api.Requests.MineAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            Mine = fresh.Select(request => new MyRequestRow(request, OpenTitleCommand)).ToList();
            MineError = null;
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            if (Mine == null)
            {
                MineError = error.Message;
            }
        }
        finally
        {
            if (!token.IsCancellationRequested)
            {
                IsMineLoading = false;
            }
        }
    }

    private async Task LoadQueueAsync(CancellationToken token)
    {
        IsQueueLoading = !HasQueue;
        try
        {
            var fresh = await model.Api.Requests.PendingAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            RejectionReasons = fresh.RejectionReasons;
            Pending.Clear();
            foreach (var request in fresh.Results)
            {
                Pending.Add(new PendingRow(this, request, fresh.ManualSonarrAddUrl(request), OpenPendingTitleCommand));
            }
            HasQueue = true;
            QueueError = null;
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            if (!HasQueue)
            {
                QueueError = error.Message;
            }
        }
        finally
        {
            if (!token.IsCancellationRequested)
            {
                IsQueueLoading = false;
            }
        }
    }

    /// <summary>"Past requests" is a separate call. A failure keeps what's already shown, and says so only when there's nothing to show.</summary>
    private async Task LoadHistoryAsync(CancellationToken token)
    {
        try
        {
            var fresh = await model.Api.Requests.HistoryAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            History = fresh.Select(request => new ReviewedRow(request, OpenTitleCommand)).ToList();
            HistoryError = null;
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            HistoryError = error.Message;
        }
    }

    // MARK: Actions

    /// <summary><c>POST /requests/approve-all</c>: one at a time on the server; failures stay pending.</summary>
    [RelayCommand]
    private async Task ApproveAllAsync()
    {
        if (IsApprovingAll)
        {
            return;
        }
        IsApprovingAll = true;
        ApproveAllMessage = null;
        try
        {
            var result = await model.Api.Requests.ApproveAllAsync();
            ApproveAllIsError = result.FailedCount > 0;
            ApproveAllMessage = result.FailedCount > 0
                ? result.Message ?? $"{result.FailedCount.ToString(CultureInfo.CurrentCulture)} request(s) couldn't be approved."
                : $"Approved {result.ApprovedCount.ToString(CultureInfo.CurrentCulture)}.";
        }
        catch (ApiException error)
        {
            ApproveAllIsError = true;
            ApproveAllMessage = error.Message;
        }
        finally
        {
            IsApprovingAll = false;
        }
    }

    [RelayCommand]
    private void OpenTitle(RequestRowBase? row)
    {
        if (row != null)
        {
            model.OpenTitle(row.TitleId);
        }
    }

    [RelayCommand]
    private void OpenPendingTitle(PendingRow? row)
    {
        if (row != null)
        {
            model.OpenTitle(row.TitleId);
        }
    }

    /// <summary>A row's action succeeded: drop it now; the reload the mutation triggers brings the server's view.</summary>
    internal void Settle(PendingRow row) => Pending.Remove(row);

    /// <summary>The page's dialog, or nothing (no reason, no reject) when the page hasn't wired one.</summary>
    internal Task<string?> ChooseReasonAsync(PendingRow row) =>
        ReasonChooser is { } chooser ? chooser(row) : Task.FromResult<string?>(null);

    // MARK: Reload triggers

    private void OnModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(AppModel.ReloadToken))
        {
            _ = LoadAsync();
        }
        else if (e.PropertyName == nameof(AppModel.Viewer))
        {
            // A promotion (or demotion) swaps which list this page is.
            var reviews = model.Viewer?.ReviewsRequests == true;
            if (reviews != Reviews)
            {
                Reviews = reviews;
                _ = LoadAsync();
            }
        }
    }

    private void OnServerChanged(object? sender, ServerChangedEventArgs e)
    {
        var requestsChanged = e.Change.HasFlag(ServerChange.Requests);
        var libraryMovedOnServer = e.Source == ServerChangeSource.Server && e.Change.HasFlag(ServerChange.Library);
        if (!requestsChanged && !libraryMovedOnServer)
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
