using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>One row of the bell's list; immutable, so "mark all read" rebuilds the list.</summary>
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
        Open = open;
    }

    private NotificationRow(NotificationRow source, bool isUnread)
    {
        Id = source.Id;
        TitleId = source.TitleId;
        Message = source.Message;
        Emoji = source.Emoji;
        TimeAgo = source.TimeAgo;
        IsUnread = isUnread;
        Open = source.Open;
    }

    public ICommand Open { get; }

    public Guid Id { get; }
    public TitleId TitleId { get; }
    public string Message { get; }

    /// <summary>"⬇️", "✅", "👍", "👎", or the bell for a kind this app doesn't know.</summary>
    public string Emoji { get; }

    /// <summary>"5m ago", as of when the list was built.</summary>
    public string TimeAgo { get; }

    public bool IsUnread { get; }

    /// <summary>What a screen reader says for the row.</summary>
    public string AccessibleName => IsUnread ? $"Unread: {Message}" : Message;

    /// <summary>The same row shown as read, for the optimistic "Mark all read".</summary>
    public NotificationRow AsRead() => IsUnread ? new NotificationRow(this, isUnread: false) : this;
}

/// <summary>
/// components/notifications-bell.tsx: the dropdown behind the bell. Loads
/// when the flyout opens, reloads while it is open if the server's unread
/// count moved (the badge poller records that), and marks read as the
/// website does: one on click, all with the button.
/// </summary>
public sealed partial class NotificationsViewModel : ObservableObject
{
    public const string EmptyMessage = "No notifications yet.";

    private readonly AppModel model;
    private CancellationTokenSource? loadCancellation;
    private bool active;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsEmpty))]
    [NotifyPropertyChangedFor(nameof(HasUnread))]
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
    public bool HasUnread => Items?.Any(row => row.IsUnread) == true;
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

    /// <summary>"Mark all read": the rows flip at once; the badge follows the server's answer.</summary>
    [RelayCommand]
    private async Task MarkAllReadAsync()
    {
        if (Items is not { } rows || !HasUnread)
        {
            return;
        }
        Items = rows.Select(row => row.AsRead()).ToList();
        try
        {
            await model.Api.Notifications.MarkAllReadAsync();
        }
        catch (ApiException error)
        {
            ErrorMessage = error.Message;
        }
    }

    /// <summary>Clicking a row opens its title and marks it read (best effort, like the website).</summary>
    [RelayCommand]
    private void Open(NotificationRow? row)
    {
        if (row == null)
        {
            return;
        }
        if (row.IsUnread)
        {
            var api = model.Api;
            _ = MarkReadQuietlyAsync(api, row.Id);
        }
        Dismissed?.Invoke(this, EventArgs.Empty);
        model.OpenTitle(row.TitleId);
    }

    private static async Task MarkReadQuietlyAsync(MarqueeApi api, Guid id)
    {
        try
        {
            await api.Notifications.MarkReadAsync(id);
        }
        catch (ApiException)
        {
            // The next open of the flyout shows it unread again; nothing to say here.
        }
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
