using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// components/comment-thread.tsx's CommentSection (0.46+): a "Comments (2)"
/// toggle and, once opened, the conversation between whoever asked (or
/// reported) and the reviewers, with a "Write a comment" box. The state and
/// rules live in Core's <see cref="CommentThreadModel"/>; this adds the
/// bindings. The Requests page keeps one per request or report across its
/// reloads, so an open thread (and a half-written comment) survives them.
/// </summary>
public sealed partial class CommentThreadViewModel : ObservableObject
{
    private readonly CommentThreadModel thread;
    private bool loading;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ToggleLabel))]
    private bool isOpen;

    /// <summary>The first load, with nothing to show yet.</summary>
    [ObservableProperty]
    private bool isLoading;

    /// <summary>The "Write a comment" box; two-way bound.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanSend))]
    [NotifyPropertyChangedFor(nameof(RemainingLabel))]
    private string draft = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanSend))]
    [NotifyPropertyChangedFor(nameof(SendLabel))]
    private bool isSending;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSendError))]
    private string? sendError;

    /// <param name="api">The session's API, read at each call.</param>
    /// <param name="count">The list's <c>commentCount</c>, for the toggle until the thread loads.</param>
    public CommentThreadViewModel(Func<MarqueeApi> api, CommentSubject subject, Guid id, int count)
    {
        thread = new CommentThreadModel(api, subject, id, count);
    }

    public Guid Id => thread.Id;

    /// <summary>Oldest first.</summary>
    public ObservableCollection<CommentItemViewModel> Comments { get; } = [];

    /// <summary>"Comment", "Comments (2)", or "Hide comments" while open.</summary>
    public string ToggleLabel => CommentText.ToggleLabel(thread.Count, IsOpen);

    public string LoadError => thread.LoadError ?? "";
    public bool HasLoadError => thread.LoadError != null && !thread.IsLoaded;

    /// <summary>"No comments yet."</summary>
    public bool IsEmpty => thread.IsLoaded && Comments.Count == 0;

    /// <summary>The "Write a comment" box shows: the viewer is part of the conversation.</summary>
    public bool CanComment => thread.CanComment;

    public int MaxLength => thread.MaxLength;

    /// <summary>"12 left" near the limit, else empty.</summary>
    public string RemainingLabel => CommentText.RemainingLabel(Draft.Length, MaxLength);

    public bool CanSend => !IsSending && CommentText.HasText(Draft);
    public string SendLabel => IsSending ? CommentText.Sending : CommentText.Send;
    public bool HasSendError => SendError != null;

    /// <summary>A fresh <c>commentCount</c> from a list reload (ignored once the thread has loaded).</summary>
    public void UpdateCount(int count)
    {
        thread.UpdateCount(count);
        OnPropertyChanged(nameof(ToggleLabel));
    }

    /// <summary>Opens (and loads) the thread, or folds it away.</summary>
    [RelayCommand]
    private void Toggle()
    {
        IsOpen = !IsOpen;
        if (IsOpen)
        {
            _ = LoadAsync();
        }
    }

    /// <summary><c>GET …/comments</c>; also "Try again".</summary>
    [RelayCommand]
    private async Task LoadAsync()
    {
        if (loading)
        {
            return;
        }
        loading = true;
        IsLoading = !thread.IsLoaded;
        try
        {
            await thread.LoadAsync();
        }
        finally
        {
            loading = false;
            IsLoading = false;
            Refresh();
        }
    }

    /// <summary>"Send": posts the box, then shows the thread again; a refusal stays under the box.</summary>
    [RelayCommand]
    private async Task SendAsync()
    {
        if (!CanSend)
        {
            return;
        }
        IsSending = true;
        SendError = null;
        try
        {
            var error = await thread.SendAsync(Draft);
            if (error == null)
            {
                Draft = "";
            }
            SendError = error;
        }
        finally
        {
            IsSending = false;
            Refresh();
        }
    }

    /// <summary>A comment's "Save"; null once saved (the thread is then reloaded).</summary>
    internal async Task<string?> EditAsync(string commentId, string text)
    {
        var error = await thread.EditAsync(commentId, text);
        if (error == null)
        {
            Refresh();
        }
        return error;
    }

    /// <summary>A comment's "Delete"; null once done (the thread is then reloaded).</summary>
    internal async Task<string?> DeleteAsync(string commentId)
    {
        var error = await thread.DeleteAsync(commentId);
        if (error == null)
        {
            Refresh();
        }
        return error;
    }

    /// <summary>The rows and everything derived from the thread, after a load.</summary>
    private void Refresh()
    {
        if (thread.IsLoaded)
        {
            Comments.Clear();
            foreach (var comment in thread.Comments)
            {
                Comments.Add(new CommentItemViewModel(this, comment));
            }
        }
        OnPropertyChanged(nameof(ToggleLabel));
        OnPropertyChanged(nameof(LoadError));
        OnPropertyChanged(nameof(HasLoadError));
        OnPropertyChanged(nameof(IsEmpty));
        OnPropertyChanged(nameof(CanComment));
        OnPropertyChanged(nameof(MaxLength));
        OnPropertyChanged(nameof(RemainingLabel));
    }
}

/// <summary>
/// One entry of a conversation: photo, name, "Admin"/"Reviewer", "Reported" /
/// "Marked fixed" / "Declined" for the notes, time, "edited", the text with
/// its line breaks, and "Edit" / "Delete" while allowed.
/// </summary>
public sealed partial class CommentItemViewModel : ObservableObject
{
    private readonly CommentThreadViewModel owner;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsBody))]
    [NotifyPropertyChangedFor(nameof(ShowsActions))]
    private bool isEditing;

    /// <summary>The edit box; two-way bound.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanSave))]
    private string editDraft;

    /// <summary>"save" or "delete" while that call is in flight.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanAct))]
    [NotifyPropertyChangedFor(nameof(CanSave))]
    [NotifyPropertyChangedFor(nameof(SaveLabel))]
    private string? busy;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    public CommentItemViewModel(CommentThreadViewModel owner, Comment comment)
    {
        this.owner = owner;
        Id = comment.Id;
        AuthorLabel = comment.Author.Label;
        AvatarUrl = comment.Author.AvatarUrl ?? "";
        MetaLine = comment.MetaLine(Format.MonthDayTime(comment.CreatedAt));
        Body = comment.BodyText;
        CanEdit = comment.CanEdit;
        CanDelete = comment.CanDelete;
        editDraft = Body;
    }

    public string Id { get; }
    public string AuthorLabel { get; }

    /// <summary>The server-relative photo path, empty for initials.</summary>
    public string AvatarUrl { get; }

    /// <summary>"Reviewer · Declined · Sep 26, 3:02 AM · edited".</summary>
    public string MetaLine { get; }

    public string Body { get; }
    public bool CanEdit { get; }
    public bool CanDelete { get; }

    /// <summary>The same limit as a new comment's.</summary>
    public int MaxLength => owner.MaxLength;

    public bool ShowsBody => !IsEditing;

    /// <summary>"Edit" / "Delete" under the text, while one is allowed and it isn't being edited.</summary>
    public bool ShowsActions => !IsEditing && (CanEdit || CanDelete);

    public bool CanAct => Busy == null;
    public bool CanSave => Busy == null && CommentText.HasText(EditDraft);
    public string SaveLabel => Busy == "save" ? CommentText.Saving : CommentText.Save;
    public bool HasError => Error != null;

    [RelayCommand]
    private void StartEdit()
    {
        EditDraft = Body;
        Error = null;
        IsEditing = true;
    }

    [RelayCommand]
    private void CancelEdit()
    {
        IsEditing = false;
        EditDraft = Body;
        Error = null;
    }

    [RelayCommand]
    private Task SaveAsync() => RunAsync("save", () => owner.EditAsync(Id, EditDraft));

    [RelayCommand]
    private Task DeleteAsync() => RunAsync("delete", () => owner.DeleteAsync(Id));

    /// <summary>A success reloads the thread (which replaces this row); a refusal shows under it.</summary>
    private async Task RunAsync(string label, Func<Task<string?>> action)
    {
        if (Busy != null)
        {
            return;
        }
        Busy = label;
        Error = null;
        try
        {
            Error = await action();
        }
        finally
        {
            Busy = null;
        }
    }
}
