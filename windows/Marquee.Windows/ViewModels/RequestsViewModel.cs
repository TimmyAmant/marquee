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
        SeasonsLine = request.SeasonsText;
    }

    /// <summary>"Seasons 1–3" under the title for a request of some seasons; empty for a whole series or a movie.</summary>
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
        SeasonsLine = request.SeasonsText;
    }

    /// <summary>"Seasons 1–3" under the title; empty for a whole series or a movie.</summary>
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
        SeasonsLine = request.SeasonsText;
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

    /// <summary>"Seasons 1–3" under the title; empty for a whole series or a movie.</summary>
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

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsMember))]
    private bool isAdmin;

    // MARK: Member

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

    public RequestsViewModel(AppModel model)
    {
        this.model = model;
        IsAdmin = model.Viewer?.IsAdmin == true;
        Pending.CollectionChanged += (_, _) => PendingCount = Pending.Count;
    }

    public bool IsMember => !IsAdmin;
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
        if (IsAdmin)
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
            var admin = model.Viewer?.IsAdmin == true;
            if (admin != IsAdmin)
            {
                IsAdmin = admin;
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
