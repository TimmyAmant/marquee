using System.ComponentModel;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>One event: "Sam requested" and the title, a link to its page, with when.</summary>
public sealed class ActivityRow
{
    public ActivityRow(ActivityItem item, ICommand open)
    {
        TitleId = item.TitleId;
        Actor = item.Actor.Label;
        Verb = item.Verb;
        Title = item.Title;
        When = Format.DateAndTime(item.CreatedAt);
        Open = open;
    }

    // Internal: bindings use the flattened strings.
    internal TitleId TitleId { get; }

    public string Actor { get; }

    /// <summary>"requested", "approved", "declined", "manually approved".</summary>
    public string Verb { get; }

    public string Title { get; }

    /// <summary>"Sep 17, 2026 4:03 PM".</summary>
    public string When { get; }

    /// <summary>Runs with this row as its parameter: the title's page.</summary>
    public ICommand Open { get; }
}

/// <summary>
/// Settings › Activity (app/settings/activity/page.tsx, the Mac's
/// ActivitySettingsView), the admin's: who requested what, and who reviewed
/// it, most recent first (<c>GET /settings/activity</c>, the last 50).
/// </summary>
public sealed partial class ActivitySettingsViewModel : ObservableObject
{
    private readonly AppModel model;
    private CancellationTokenSource? loadCancellation;
    private bool active;

    public ActivitySettingsViewModel(AppModel model)
    {
        this.model = model;
    }

    /// <summary>Null until the first answer.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsEmpty))]
    [NotifyPropertyChangedFor(nameof(IsLoading))]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    private IReadOnlyList<ActivityRow>? rows;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsLoading))]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    private string? error;

    /// <summary>"Nothing yet."</summary>
    public bool IsEmpty => Rows is { Count: 0 };

    public bool IsLoading => Rows == null && Error == null;

    /// <summary>Only while there's no older list to keep showing.</summary>
    public bool ShowsError => Rows == null && Error != null;

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

    [RelayCommand]
    private async Task LoadAsync()
    {
        loadCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        loadCancellation = cancellation;
        var token = cancellation.Token;
        Error = null;
        try
        {
            var events = await model.Api.Activity.RecentAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            Rows = events.Select(item => new ActivityRow(item, OpenTitleCommand)).ToList();
        }
        catch (ApiException failure)
        {
            if (failure.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            if (Rows == null)
            {
                Error = failure.Message;
            }
        }
    }

    [RelayCommand]
    private void OpenTitle(ActivityRow? row)
    {
        if (row != null)
        {
            model.OpenTitle(row.TitleId);
        }
    }

    private void OnModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(AppModel.ReloadToken))
        {
            _ = LoadAsync();
        }
    }

    /// <summary>A request made, approved or declined from this app adds a row. Raised on whatever thread finished the request.</summary>
    private void OnServerChanged(object? sender, ServerChangedEventArgs e)
    {
        if (!e.Change.HasFlag(ServerChange.Requests))
        {
            return;
        }
        model.Dispatcher.TryEnqueue(() =>
        {
            if (active && model.IsSignedIn)
            {
                _ = LoadAsync();
            }
        });
    }
}
