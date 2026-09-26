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
    /// <param name="actions">Edit, Cancel and the conversation (0.46+); null from an older server.</param>
    public MyRequestRow(MyRequest request, ICommand openTitle, RequestActionsViewModel? actions)
        : base(request.Title, request.PosterPath, request.CreatedAt, request.TitleId, openTitle)
    {
        StatusLabel = request.StatusLabel;
        Tone = request.StatusTone.ToBadgeTone();
        ReasonLine = request.RejectionReason.NonBlank() is { } reason ? $"Reason: {reason}" : "";
        SeasonsLine = request.DetailText;
        Actions = actions;
    }

    /// <summary>"Edit" / "Cancel request" while pending, the hint once approved, and "Comments (N)" (0.46+).</summary>
    public RequestActionsViewModel? Actions { get; }

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
    /// <param name="thread">Its conversation (0.46+); null from an older server.</param>
    public ReviewedRow(ReviewedRequest request, ICommand openTitle, CommentThreadViewModel? thread)
        : base(request.Title, request.PosterPath, request.CreatedAt, request.TitleId, openTitle)
    {
        Thread = thread;
        RequesterLabel = request.RequestedBy.Label;
        StatusLabel = request.StatusLabel;
        Tone = request.Status == RequestStatus.Approved ? BadgeTone.Owned : BadgeTone.Neutral;
        ReasonLine = request.RejectionReason.NonBlank() is { } reason ? $"Reason: {reason}" : "";
        SeasonsLine = request.DetailText;
        AddedToLine = request.AddedToLine ?? "";
        ShowsNotFound = request.IsNotFound;
    }

    /// <summary>"Seasons 1–3" and/or "In 4K" (joined with " · ") under the title; empty for a regular whole series or movie.</summary>
    public string SeasonsLine { get; }

    public string RequesterLabel { get; }
    public string StatusLabel { get; }
    public BadgeTone Tone { get; }
    public string ReasonLine { get; }

    /// <summary>"Added to Radarr 2" under an Approved badge (0.43+); empty when unknown.</summary>
    public string AddedToLine { get; }

    /// <summary>The red "Can't find" badge next to "Approved" (0.46+).</summary>
    public bool ShowsNotFound { get; }

    /// <summary>"Comments (N)" (0.46+); null hides it.</summary>
    public CommentThreadViewModel? Thread { get; }
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

    /// <summary>"Seasons 1–3" and/or "In 4K" (joined with " · ") under the title; empty for a regular whole series or movie. An edit changes it.</summary>
    [ObservableProperty]
    private string seasonsLine;

    /// <summary>"Changed since asking" (0.46+): the requester or a reviewer changed its seasons or 4K; empty otherwise.</summary>
    [ObservableProperty]
    private string changedLine;

    /// <param name="actions">"Edit" and the conversation (0.46+); null from an older server.</param>
    public PendingRow(RequestsViewModel owner, PendingRequest request, Uri? manualSonarrUrl, ICommand openTitle, RequestActionsViewModel? actions)
    {
        this.owner = owner;
        Id = request.Id;
        Is4k = request.Is4k;
        Title = request.Title;
        TitleId = request.TitleId;
        RequesterLabel = request.RequestedBy.Label;
        DateLabel = Format.ShortDate(request.CreatedAt);
        seasonsLine = request.DetailText;
        changedLine = request.WasEdited ? RequestLifecycle.ChangedSinceAsking : "";
        Actions = actions;
        posterUrl = request.PosterPath.Url(ImageSize.W92);
        // Only an https Sonarr can be opened from here (see ExternalLinks).
        this.manualSonarrUrl = ExternalLinks.CanOpen(manualSonarrUrl) ? manualSonarrUrl : null;
        Open = openTitle;
        Advanced = new AddOverridesViewModel(() => owner.Api, request.MediaType, request.TmdbId, request.Is4k)
        {
            Unsupported = owner.AdvancedIsUnsupported,
            IsUnsupported = owner.HasNoAddOptions,
        };
    }

    /// <summary>"Advanced" under the row (0.43+): which server and settings Approve adds it with.</summary>
    public AddOverridesViewModel Advanced { get; }

    public Guid Id { get; }

    /// <summary>The copy "Advanced" picks servers for; a row whose 4K changed is built anew.</summary>
    public bool Is4k { get; }

    public string Title { get; }
    public TitleId TitleId { get; }
    public string RequesterLabel { get; }
    public string DateLabel { get; }

    /// <summary>"Edit" (a reviewer may change seasons and 4K before approving) and "Comments (N)" (0.46+).</summary>
    public RequestActionsViewModel? Actions { get; }

    /// <summary>A reload brought this request again: what an edit may have changed.</summary>
    internal void Refresh(PendingRequest request)
    {
        SeasonsLine = request.DetailText;
        ChangedLine = request.WasEdited ? RequestLifecycle.ChangedSinceAsking : "";
    }

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
    /// <remarks>An unopened "Advanced" sends no body, exactly the plain Approve; an opened one sends its picks.</remarks>
    [RelayCommand]
    private Task ApproveAsync()
    {
        var overrides = Advanced.Overrides;
        return RunAsync("approve", api => api.Requests.ApproveAsync(Id, overrides));
    }

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

    /// <param name="thread">Its conversation (0.46+); null from an older server.</param>
    public IssueRow(RequestsViewModel owner, Issue issue, bool isAdmin, System.Windows.Input.ICommand openTitle, CommentThreadViewModel? thread)
    {
        this.owner = owner;
        Thread = thread;
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

    /// <summary>"Comments (N)" (0.46+); null hides it.</summary>
    public CommentThreadViewModel? Thread { get; }

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
/// components/not-found-section.tsx's card (0.46+): an approved request
/// Sonarr/Radarr hasn't found, with "Search again", "Open in Radarr" (when
/// the server knows the page) and "Mark as found".
/// </summary>
public sealed partial class NotFoundRow : ObservableObject
{
    private readonly RequestsViewModel owner;
    private readonly Uri? posterUrl;
    private readonly Uri? arrLink;
    private readonly string searchingMessage;
    private readonly string arrKindName;
    private ImageSource? poster;

    /// <summary>"search" or "dismiss" while that call is in flight.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanAct))]
    [NotifyPropertyChangedFor(nameof(SearchLabel))]
    [NotifyPropertyChangedFor(nameof(DismissLabel))]
    private string? busy;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    /// <summary>"Radarr is searching again…" after Search again.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasInfo))]
    private string? info;

    public NotFoundRow(RequestsViewModel owner, NotFoundRequest request, System.Windows.Input.ICommand openTitle)
    {
        this.owner = owner;
        Id = request.Id;
        Title = request.Title;
        TitleId = request.TitleId;
        SeasonsLine = request.DetailText;
        MetaLine = request.MetaLine(DateTimeOffset.Now, Format.ShortDate(request.NotFoundSince));
        HintLine = request.HintText;
        OpenInArrLabel = request.OpenInArrLabel;
        arrLink = request.ArrLink;
        searchingMessage = request.SearchingMessage;
        arrKindName = request.ArrKindName;
        posterUrl = request.PosterPath.Url(ImageSize.W92);
        Open = openTitle;
    }

    public Guid Id { get; }
    public string Title { get; }
    public TitleId TitleId { get; }

    /// <summary>"Seasons 1–3" and/or "In 4K" (joined with " · ") next to the title; empty for neither.</summary>
    public string SeasonsLine { get; }

    /// <summary>"Susan · can't find for 3 days (since Sep 18, 2026) · Radarr".</summary>
    public string MetaLine { get; }

    /// <summary>The server's tip under the details.</summary>
    public string HintLine { get; }

    /// <summary>"Open in Radarr" / "Open in Sonarr".</summary>
    public string OpenInArrLabel { get; }

    /// <summary>The server knows the title's page in Sonarr/Radarr.</summary>
    public bool CanOpenInArr => arrLink != null;

    public bool HasPoster => posterUrl != null;
    public ImageSource? Poster => posterUrl == null ? null : poster ??= new BitmapImage(posterUrl);
    public System.Windows.Input.ICommand Open { get; }

    public bool CanAct => Busy == null;
    public bool HasError => Error != null;
    public bool HasInfo => Info != null;
    public string SearchLabel => Busy == "search" ? "Searching…" : "Search again";
    public string DismissLabel => Busy == "dismiss" ? "Saving…" : "Mark as found";

    /// <summary><c>POST /requests/{id}/not-found/search</c>: stays listed until something is grabbed.</summary>
    [RelayCommand]
    private Task SearchAgainAsync() => RunAsync("search", api => api.Requests.SearchNotFoundAsync(Id), searchingMessage);

    /// <summary><c>POST /requests/{id}/not-found/dismiss</c>: off the list for good.</summary>
    [RelayCommand]
    private Task DismissAsync() => RunAsync("dismiss", api => api.Requests.DismissNotFoundAsync(Id));

    /// <summary>
    /// The title's page in Sonarr/Radarr, in the browser. The link is the
    /// admin's own Sonarr/Radarr address, which is usually plain http on the
    /// home network, so http is let through here; no other scheme ever is
    /// (see <see cref="NotFoundRequest.ArrLink"/>).
    /// </summary>
    [RelayCommand]
    private async Task OpenInArrAsync()
    {
        if (arrLink == null)
        {
            return;
        }
        try
        {
            await global::Windows.System.Launcher.LaunchUriAsync(arrLink);
        }
        catch (Exception failure) when (failure is ArgumentException or UnauthorizedAccessException or System.Runtime.InteropServices.COMException)
        {
            Error = $"Couldn't open {arrKindName}.";
        }
    }

    /// <summary>
    /// Runs one action. Mark as found drops the row at once (the reload the
    /// mutation triggers brings the server's view); a request that's already
    /// off the list ("That request isn't in Can't find any more.") reloads
    /// rather than showing an error.
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
            if (label == "dismiss")
            {
                owner.Settle(this);
            }
        }
        catch (ApiException failure)
        {
            if (failure.Kind == ApiErrorKind.NotFound)
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
/// components/couldnt-add-section.tsx's row (0.46+): approved, but
/// Sonarr/Radarr couldn't be reached or didn't take it. The error in red,
/// the "Advanced" picks, "Retry", for the admin "Added it by hand", and the
/// conversation.
/// </summary>
public sealed partial class CouldntAddRow : ObservableObject
{
    private readonly RequestsViewModel owner;
    private readonly Uri? posterUrl;
    private readonly string serverError;
    private ImageSource? poster;

    /// <summary>"retry" or "manual" while that call is in flight.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanAct))]
    [NotifyPropertyChangedFor(nameof(RetryLabel))]
    [NotifyPropertyChangedFor(nameof(ManualLabel))]
    private string? busy;

    /// <summary>The last action's failure, shown in place of the stored error.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ErrorLine))]
    private string? actionError;

    /// <param name="thread">Its conversation; null from a server without them.</param>
    public CouldntAddRow(RequestsViewModel owner, ReviewedRequest request, bool isAdmin, ICommand openTitle, CommentThreadViewModel? thread)
    {
        this.owner = owner;
        Id = request.Id;
        Title = request.Title;
        TitleId = request.TitleId;
        SeasonsLine = request.DetailText;
        var failedSince = request.AddFailed?.Since ?? request.ReviewedAt ?? request.CreatedAt;
        MetaLine = request.CouldntAddLine(Format.ShortDate(request.ReviewedAt ?? failedSince), Format.DateAndTime(failedSince));
        serverError = request.AddFailed?.Error ?? "";
        ShowsAddedByHand = isAdmin;
        posterUrl = request.PosterPath.Url(ImageSize.W92);
        Open = openTitle;
        Thread = thread;
        Advanced = new AddOverridesViewModel(() => owner.Api, request.MediaType, request.TmdbId, request.Is4k)
        {
            Unsupported = owner.AdvancedIsUnsupported,
            IsUnsupported = owner.HasNoAddOptions,
        };
    }

    public Guid Id { get; }
    public string Title { get; }
    public TitleId TitleId { get; }

    /// <summary>"Seasons 1–3" and/or "In 4K" next to the title; empty for neither.</summary>
    public string SeasonsLine { get; }

    /// <summary>"member1 · approved Sep 17, 2026 · last tried Sep 17, 2026 7:02 PM".</summary>
    public string MetaLine { get; }

    /// <summary>What went wrong: the last Retry's failure, else what the server kept.</summary>
    public string ErrorLine => ActionError ?? serverError;

    /// <summary>"Added it by hand" is the admin's.</summary>
    public bool ShowsAddedByHand { get; }

    /// <summary>"Advanced": the server and settings Retry adds it with (the ones it was approved with when left closed).</summary>
    public AddOverridesViewModel Advanced { get; }

    /// <summary>"Comments (N)"; null hides it.</summary>
    public CommentThreadViewModel? Thread { get; }

    public bool HasPoster => posterUrl != null;
    public ImageSource? Poster => posterUrl == null ? null : poster ??= new BitmapImage(posterUrl);
    public ICommand Open { get; }

    public bool CanAct => Busy == null;
    public string RetryLabel => Busy == "retry" ? RequestLifecycle.RetryingLabel : RequestLifecycle.RetryLabel;
    public string ManualLabel => Busy == "manual" ? "Saving…" : RequestLifecycle.AddedByHandLabel;
    public string ManualTooltip => RequestLifecycle.AddedByHandTooltip;

    /// <summary><c>POST /requests/{id}/retry</c>, with the "Advanced" picks once they're opened.</summary>
    [RelayCommand]
    private Task RetryAsync()
    {
        var overrides = Advanced.Overrides;
        return RunAsync("retry", api => api.Requests.RetryAsync(Id, overrides));
    }

    /// <summary><c>POST /requests/{id}/manual-approve</c>: the admin got it some other way.</summary>
    [RelayCommand]
    private Task ManuallyApproveAsync() => RunAsync("manual", api => api.Requests.ManuallyApproveAsync(Id));

    /// <summary>A success drops the row at once; one that's already off the list ("That request isn't waiting to be added any more.") reloads.</summary>
    private async Task RunAsync(string label, Func<MarqueeApi, Task> action)
    {
        if (Busy != null)
        {
            return;
        }
        Busy = label;
        ActionError = null;
        try
        {
            await action(owner.Api);
            owner.Settle(this);
        }
        catch (ApiException failure)
        {
            if (failure.Kind == ApiErrorKind.NotFound && label == "retry")
            {
                owner.ReloadIssues();
            }
            else
            {
                ActionError = failure.Message;
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
    [NotifyPropertyChangedFor(nameof(ShowsNotFound))]
    [NotifyPropertyChangedFor(nameof(ShowsCouldntAdd))]
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

    // MARK: Couldn't add (addFailed on /requests/history, 0.46+; components/couldnt-add-section.tsx)

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsCouldntAdd))]
    [NotifyPropertyChangedFor(nameof(CouldntAddCountLabel))]
    private IReadOnlyList<CouldntAddRow> couldntAdd = [];

    // MARK: Conversations and edits (0.46+)

    /// <summary>
    /// One thread per request or report, kept across reloads, so an open
    /// conversation (and a half-written comment) survives the reload an edit
    /// or another row's action brings.
    /// </summary>
    private readonly Dictionary<(CommentSubject Subject, Guid Id), CommentThreadViewModel> threads = new();

    /// <summary>The same for each request's Edit / Cancel state.</summary>
    private readonly Dictionary<Guid, RequestActionsViewModel> requestActions = new();

    // MARK: Can't find (GET /requests/not-found, 0.46+; components/not-found-section.tsx)

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsNotFound))]
    [NotifyPropertyChangedFor(nameof(NotFoundCountLabel))]
    private IReadOnlyList<NotFoundRow> notFound = [];

    /// <summary>"Approved and released, but Sonarr/Radarr still has nothing 24 hours or more after approval. …"</summary>
    [ObservableProperty]
    private string notFoundExplanation = "";

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

    /// <summary>"Couldn't add" shows for reviewers while anything is listed; an older server has none.</summary>
    public bool ShowsCouldntAdd => Reviews && CouldntAdd.Count > 0;

    /// <summary>The count next to the "Couldn't add" heading.</summary>
    public string CouldntAddCountLabel => CouldntAdd.Count.ToString(CultureInfo.CurrentCulture);

    public string CouldntAddExplanation => RequestHistory.CouldntAddExplanation;

    /// <summary>"Can't find" shows for reviewers while anything is listed; an older server has none.</summary>
    public bool ShowsNotFound => Reviews && NotFound.Count > 0;

    /// <summary>The count next to the "Can't find" heading.</summary>
    public string NotFoundCountLabel => NotFound.Count.ToString(CultureInfo.CurrentCulture);

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
                await LoadNotFoundAsync(token);
            }
            if (!token.IsCancellationRequested)
            {
                await LoadHistoryAsync(token);
            }
        }
        else
        {
            NotFound = [];
            CouldntAdd = [];
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
            OpenIssues = fresh.Open.Select(IssueRowFor).ToList();
            FixedIssues = fresh.Fixed.Select(IssueRowFor).ToList();
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

    /// <summary>
    /// "Can't find" (0.46+, reviewers). An older server has no
    /// <c>/requests/not-found</c> (404): the section stays hidden. Any other
    /// failure keeps what's shown; the next reload tries again. A row still
    /// listed keeps its state ("Radarr is searching again…") across reloads.
    /// </summary>
    private async Task LoadNotFoundAsync(CancellationToken token)
    {
        try
        {
            var fresh = await model.Api.Requests.NotFoundAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            var existing = NotFound.ToDictionary(row => row.Id);
            NotFound = fresh.Results
                .Select(request => existing.TryGetValue(request.Id, out var row)
                    ? row
                    : new NotFoundRow(this, request, OpenNotFoundTitleCommand))
                .ToList();
            NotFoundExplanation = fresh.Explanation;
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            if (error.Kind is ApiErrorKind.NotFound or ApiErrorKind.Forbidden)
            {
                NotFound = [];
            }
        }
    }

    [RelayCommand]
    private void OpenNotFoundTitle(NotFoundRow? row)
    {
        if (row != null)
        {
            model.OpenTitle(row.TitleId);
        }
    }

    /// <summary>"Mark as found" succeeded: drop the row now; the reload the mutation triggers brings the server's view.</summary>
    internal void Settle(NotFoundRow row) => NotFound = NotFound.Where(candidate => candidate != row).ToList();

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
            Mine = fresh.Select(request => new MyRequestRow(
                    request,
                    OpenTitleCommand,
                    ActionsFor(request.Id, request.HasConversation, request.CanEdit, request.CanCancel, request.ChangeHint, request.CommentCount)))
                .ToList();
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
            // A row still pending keeps its state (an open "Advanced" and its picks) across reloads.
            var existing = Pending.ToDictionary(row => row.Id);
            // One whose 4K changed (an edit) is built anew, so "Advanced" lists the right servers.
            var rows = fresh.Results
                .Select(request =>
                {
                    var actions = ActionsFor(request.Id, request.HasConversation, request.HasConversation, false, null, request.CommentCount);
                    if (existing.TryGetValue(request.Id, out var row) && row.Is4k == request.Is4k)
                    {
                        row.Refresh(request);
                        return row;
                    }
                    return new PendingRow(this, request, fresh.ManualSonarrAddUrl(request), OpenPendingTitleCommand, actions);
                })
                .ToList();
            Pending.Clear();
            foreach (var row in rows)
            {
                Pending.Add(row);
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
            // "Couldn't add" (0.46+) comes first on the wire and has its own section.
            var existingFailed = CouldntAdd.ToDictionary(row => row.Id);
            CouldntAdd = RequestHistory.CouldntAdd(fresh)
                .Select(request => existingFailed.TryGetValue(request.Id, out var row)
                    ? row
                    : new CouldntAddRow(this, request, model.Viewer?.IsAdmin == true, OpenCouldntAddTitleCommand,
                        ThreadFor(CommentSubject.Request, request.Id, request.HasConversation, request.CommentCount)))
                .ToList();
            History = RequestHistory.Past(fresh)
                .Select(request => new ReviewedRow(request, OpenTitleCommand,
                    ThreadFor(CommentSubject.Request, request.Id, request.HasConversation, request.CommentCount)))
                .ToList();
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

    /// <summary>Retry or "Added it by hand" went through: drop the row now; the reload brings the server's view.</summary>
    internal void Settle(CouldntAddRow row) => CouldntAdd = CouldntAdd.Where(candidate => candidate != row).ToList();

    [RelayCommand]
    private void OpenCouldntAddTitle(CouldntAddRow? row)
    {
        if (row != null)
        {
            model.OpenTitle(row.TitleId);
        }
    }

    /// <summary>
    /// The conversation of a request or report, the same one across reloads
    /// (with the list's fresh count); null where the server has none (older than 0.46).
    /// </summary>
    private CommentThreadViewModel? ThreadFor(CommentSubject subject, Guid id, bool available, int count)
    {
        if (!available)
        {
            return null;
        }
        if (threads.TryGetValue((subject, id), out var thread))
        {
            thread.UpdateCount(count);
            return thread;
        }
        thread = new CommentThreadViewModel(() => model.Api, subject, id, count);
        threads[(subject, id)] = thread;
        return thread;
    }

    /// <summary>A request's Edit / Cancel / conversation, the same across reloads with what it allows now; null on an older server.</summary>
    private RequestActionsViewModel? ActionsFor(Guid id, bool available, bool canEdit, bool canCancel, string? hint, int count)
    {
        if (ThreadFor(CommentSubject.Request, id, available, count) is not { } thread)
        {
            return null;
        }
        if (!requestActions.TryGetValue(id, out var actions))
        {
            actions = new RequestActionsViewModel(() => model.Api, id, thread);
            requestActions[id] = actions;
        }
        actions.Update(canEdit, canCancel, hint);
        return actions;
    }

    private IssueRow IssueRowFor(Issue issue) =>
        new(this, issue, Reviews, OpenIssueTitleCommand, ThreadFor(CommentSubject.Issue, issue.Id, issue.HasConversation, issue.CommentCount));

    /// <summary>The server has no add options (older than 0.43): no row offers "Advanced".</summary>
    internal bool HasNoAddOptions { get; private set; }

    /// <summary>One row found out the server has no add options: hide "Advanced" on every row.</summary>
    internal void AdvancedIsUnsupported()
    {
        HasNoAddOptions = true;
        foreach (var row in Pending)
        {
            row.Advanced.IsUnsupported = true;
        }
        foreach (var row in CouldntAdd)
        {
            row.Advanced.IsUnsupported = true;
        }
    }

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
