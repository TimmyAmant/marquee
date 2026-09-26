using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// components/request-lifecycle.tsx under a request (0.46+): "Edit" (the
/// season picker with this request's seasons ticked; the control shows the
/// dialog, which needs a XamlRoot), "Cancel request" with its inline "Cancel
/// it? Yes, cancel / Keep it", the hint under an approved one, and the
/// request's conversation. Used by the member's Requests rows, the review
/// queue and the title page's "Your request" lines.
/// </summary>
public sealed partial class RequestActionsViewModel : ObservableObject
{
    private readonly Func<MarqueeApi> api;
    private readonly Action? changed;

    [ObservableProperty]
    private bool canEdit;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsCancel))]
    private bool canCancel;

    /// <summary>"Need a change? Ask in its comments." under an approved request; empty otherwise.</summary>
    [ObservableProperty]
    private string hint = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(EditLabel))]
    [NotifyPropertyChangedFor(nameof(CanAct))]
    private bool isLoadingEdit;

    /// <summary>"Cancel it?" with "Yes, cancel" and "Keep it" in place of "Cancel request".</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsCancel))]
    private bool isConfirmingCancel;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ConfirmCancelLabel))]
    [NotifyPropertyChangedFor(nameof(CanAct))]
    private bool isCancelling;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    /// <param name="api">The session's API, read at each call.</param>
    /// <param name="thread">The request's conversation; null where the server has none (older than 0.46).</param>
    /// <param name="changed">Runs after an edit or a cancel went through (the title page re-reads its status; the Requests page reloads on the recorded change anyway).</param>
    public RequestActionsViewModel(Func<MarqueeApi> api, Guid id, CommentThreadViewModel? thread, Action? changed = null)
    {
        this.api = api;
        this.changed = changed;
        Id = id;
        Thread = thread;
    }

    public Guid Id { get; }

    /// <summary>"Comments (N)" and the thread; null hides them.</summary>
    public CommentThreadViewModel? Thread { get; }

    public bool HasThread => Thread != null;

    public string EditLabel => IsLoadingEdit ? RequestLifecycle.EditLoadingLabel : RequestLifecycle.EditLabel;

    /// <summary>"Cancel request" itself: allowed, and not already asking.</summary>
    public bool ShowsCancel => CanCancel && !IsConfirmingCancel;

    public string ConfirmCancelLabel => IsCancelling ? RequestLifecycle.CancellingLabel : RequestLifecycle.ConfirmCancelLabel;

    /// <summary>Nothing in flight.</summary>
    public bool CanAct => !IsLoadingEdit && !IsCancelling;

    public bool HasError => Error != null;

    /// <summary>A reload brought the request again: what it allows now, and the hint.</summary>
    public void Update(bool canEdit, bool canCancel, string? hint)
    {
        CanEdit = canEdit;
        CanCancel = canCancel;
        Hint = hint ?? "";
        if (!canCancel)
        {
            IsConfirmingCancel = false;
        }
    }

    /// <summary>
    /// "Edit"'s first step, <c>GET /requests/{id}/edit-options</c>. Null
    /// (with the reason under the buttons) when it can't be edited now.
    /// </summary>
    public async Task<RequestEditOptions?> LoadEditOptionsAsync()
    {
        if (!CanAct)
        {
            return null;
        }
        IsLoadingEdit = true;
        Error = null;
        try
        {
            return await api().Requests.EditOptionsAsync(Id);
        }
        catch (ApiException failure)
        {
            if (!failure.IsCancellation)
            {
                Error = LifecycleErrors.ForRequestChange(failure);
            }
            return null;
        }
        finally
        {
            IsLoadingEdit = false;
        }
    }

    /// <summary>
    /// The edit dialog's "Save changes" (<c>PATCH /requests/{id}</c>). Throws
    /// <see cref="ApiException"/> for the dialog to show inline.
    /// </summary>
    public async Task SaveEditAsync(RequestEdit edit)
    {
        await api().Requests.EditAsync(Id, edit);
        Error = null;
        changed?.Invoke();
    }

    [RelayCommand]
    private void StartCancel()
    {
        Error = null;
        IsConfirmingCancel = true;
    }

    [RelayCommand]
    private void KeepIt() => IsConfirmingCancel = false;

    /// <summary>"Yes, cancel": <c>DELETE /requests/{id}</c>.</summary>
    [RelayCommand]
    private async Task ConfirmCancelAsync()
    {
        if (!CanAct)
        {
            return;
        }
        IsCancelling = true;
        Error = null;
        try
        {
            await api().Requests.CancelAsync(Id);
            IsConfirmingCancel = false;
            CanCancel = false;
            CanEdit = false;
            changed?.Invoke();
        }
        catch (ApiException failure)
        {
            Error = LifecycleErrors.ForRequestChange(failure);
        }
        finally
        {
            IsCancelling = false;
        }
    }
}

/// <summary>
/// components/my-title-requests.tsx's line (0.46+): one of the viewer's own
/// requests for the title under its actions, "Your request (Season 2) is
/// waiting for review", with Edit / Cancel while pending and the conversation.
/// </summary>
public sealed class TitleRequestItem(TitleRequestSummary request, RequestActionsViewModel actions)
{
    public Guid Id { get; } = request.Id;

    /// <summary>"Your request (Season 2) is waiting for review".</summary>
    public string Line { get; } = request.Line;

    public RequestActionsViewModel Actions { get; } = actions;
}
