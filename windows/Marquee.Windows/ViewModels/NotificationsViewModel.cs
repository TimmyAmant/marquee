using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>One row of the bell's list.</summary>
public sealed class NotificationRow
{
    /// <param name="open">Runs with this row as its parameter when the row is clicked.</param>
    public NotificationRow(NotificationItem item, ICommand open)
    {
        Id = item.Id;
        TitleId = item.TitleId;
        Message = item.Message;
        Emoji = item.EventType.Emoji;
        TimeAgo = item.TimeAgo();
        IsUnread = !item.Read;
        SenderLabel = item.SharedBy?.Label ?? "";
        SenderAvatarUrl = item.SharedBy?.AvatarUrl ?? "";
        HasSender = item.SharedBy != null;
        NoteLine = item.Note.NonBlank() is { } note ? Loc.Format("Notifications_NoteLine", note) : "";
        Open = open;
    }

    public ICommand Open { get; }

    public Guid Id { get; }
    public TitleId TitleId { get; }
    public string Message { get; }

    /// <summary>"⬇️", "✅", "👍", "👎", "📨", or the bell for a kind this app doesn't know.</summary>
    public string Emoji { get; }

    /// <summary>
    /// A shared title's sender (0.45.1+): the row leads with their photo, else
    /// initials, in place of the emoji. False for every other kind, and once
    /// the sender's account is removed.
    /// </summary>
    public bool HasSender { get; }

    /// <summary>The sender's name, for the initials; empty without one.</summary>
    public string SenderLabel { get; }

    /// <summary>The sender's photo path; empty for none.</summary>
    public string SenderAvatarUrl { get; }

    /// <summary>The sharer's note in quotes, under the message; empty without one.</summary>
    public string NoteLine { get; }

    /// <summary>"5m ago", as of when the list was built.</summary>
    public string TimeAgo { get; }

    public bool IsUnread { get; }

    /// <summary>What a screen reader says for the row.</summary>
    public string AccessibleName => IsUnread ? Loc.Format("Notifications_UnreadRow", Message) : Message;
}

/// <summary>
/// components/notifications-bell.tsx: the dropdown behind the bell. Loads
/// when the flyout opens, reloads while it is open if the server's unread
/// count moved (the badge poller records that). Opening it reads them all,
/// as the website's does: the badge goes, and what was new keeps its dot
/// while the flyout is open.
/// </summary>
public sealed partial class NotificationsViewModel : ObservableObject
{
    public static string EmptyMessage => Loc.Get("Notifications_EmptyMessage");

    private readonly AppModel model;
    private CancellationTokenSource? loadCancellation;
    private bool active;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsEmpty))]
    [NotifyPropertyChangedFor(nameof(HasItems))]
    private IReadOnlyList<NotificationRow>? items;

    /// <summary>Only until the first answer; a reload keeps the rows up.</summary>
    [ObservableProperty]
    private bool isLoading;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    private string? errorMessage;

    public NotificationsViewModel(AppModel model)
    {
        this.model = model;
    }

    /// <summary>Raised after a row was clicked, so the host closes the flyout before the title opens.</summary>
    public event EventHandler? Dismissed;

    public bool HasItems => Items is { Count: > 0 };
    public bool IsEmpty => Items is { Count: 0 };
    public bool ShowsError => ErrorMessage != null && !HasItems;

    // MARK: Lifecycle

    /// <summary>The flyout opened: fetch, and follow the server's count while it stays open.</summary>
    public void Activate()
    {
        if (active)
        {
            return;
        }
        active = true;
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
        model.Events.Changed -= OnServerChanged;
        loadCancellation?.Cancel();
    }

    /// <summary>
    /// Signed out (or switched server): forget the list, so the next account
    /// never sees, or clicks, the last one's notifications.
    /// </summary>
    public void Reset()
    {
        loadCancellation?.Cancel();
        Items = null;
        ErrorMessage = null;
        IsLoading = false;
    }

    // MARK: Loading

    [RelayCommand]
    private async Task LoadAsync()
    {
        loadCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        loadCancellation = cancellation;
        var token = cancellation.Token;

        IsLoading = Items == null;
        try
        {
            var list = await model.Api.Notifications.ListAsync(ct: token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            Items = list.Results.Select(item => new NotificationRow(item, OpenCommand)).ToList();
            ErrorMessage = null;
            if (list.Results.Any(item => !item.Read))
            {
                await MarkAllReadAsync();
            }
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            // A failure keeps what's already shown, and says so only when there's nothing to show.
            if (Items == null)
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

    /// <summary>
    /// The list was seen: everything is read on the server, and the badge
    /// goes at once rather than at the next poll. The rows keep their dots.
    /// </summary>
    private async Task MarkAllReadAsync()
    {
        model.NotificationsRead();
        try
        {
            await model.Api.Notifications.MarkAllReadAsync();
        }
        catch (ApiException error)
        {
            ErrorMessage = error.Message;
        }
    }

    /// <summary>Clicking a row opens its title (opening the list already read it).</summary>
    [RelayCommand]
    private void Open(NotificationRow? row)
    {
        if (row == null)
        {
            return;
        }
        Dismissed?.Invoke(this, EventArgs.Empty);
        model.OpenTitle(row.TitleId);
    }

    // MARK: Reload triggers

    /// <summary>Raised on the thread that completed a request, so the reload is queued onto the UI thread.</summary>
    private void OnServerChanged(object? sender, ServerChangedEventArgs e)
    {
        if (e.Source != ServerChangeSource.Server || !e.Change.HasFlag(ServerChange.Notifications))
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
