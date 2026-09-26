using System.ComponentModel;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;

namespace Marquee.Windows.ViewModels;

/// <summary>One release or air date in a day of the calendar grid.</summary>
public sealed class CalendarEntryItem
{
    private readonly Uri? posterUrl;
    private ImageSource? poster;

    public CalendarEntryItem(CalendarEntry entry, ICommand open)
    {
        Name = entry.Name;
        Subtitle = entry.Subtitle;
        TitleId = entry.TitleId;
        posterUrl = entry.PosterPath.Url(ImageSize.W92);
        Open = open;
        AccessibleName = $"{entry.Name}, {entry.Subtitle}";
    }

    public string Name { get; }

    /// <summary>"S01E03", "In theaters", "Digital release" or "On disc".</summary>
    public string Subtitle { get; }

    public TitleId TitleId { get; }
    public bool HasPoster => posterUrl != null;
    public ImageSource? Poster => posterUrl == null ? null : poster ??= new BitmapImage(posterUrl);
    public string AccessibleName { get; }

    /// <summary>Runs with this item as its parameter: opens the title.</summary>
    public ICommand Open { get; }
}

/// <summary>
/// One cell of the month grid — a day of this month, or of the weeks either
/// side that the grid's first and last rows reach into (dimmed, like the
/// Mac's and the website's).
/// </summary>
public sealed class CalendarDayCell(DateOnly day, bool isToday, bool inMonth, IReadOnlyList<CalendarEntryItem> entries)
{
    /// <summary>A cell shows this many titles, then "+N more" (CalendarScreen.maxVisiblePerDay).</summary>
    public const int MaxVisible = 4;

    public string DayNumber { get; } = day.Day.ToString(System.Globalization.CultureInfo.CurrentCulture);
    public bool IsToday { get; } = isToday;
    public double CellOpacity { get; } = inMonth ? 1 : 0.4;
    public IReadOnlyList<CalendarEntryItem> Entries { get; } = entries.Take(MaxVisible).ToList();
    public bool HasMore { get; } = entries.Count > MaxVisible;
    public string MoreText { get; } = entries.Count > MaxVisible ? $"+{entries.Count - MaxVisible} more" : "";
}

/// <summary>
/// app/calendar/page.tsx: the server's month grid of Radarr releases and
/// Sonarr air dates, in the server's time zone. Prev / Today / Next ask the
/// server for another month; nothing is computed locally.
/// </summary>
public sealed partial class CalendarViewModel : ObservableObject
{
    public const string ErrorTitle = "Couldn't load the calendar";
    public const string LoadingLabel = "Loading the calendar…";

    private readonly AppModel model;
    private CancellationTokenSource? loadCancellation;
    private bool active;

    /// <summary>Null until the first load: the server picks its own current month.</summary>
    private CalendarMonth? month;

    private CalendarMonthResponse? page;

    /// <summary>The header's small spinner: another month is on its way while the current one stays up.</summary>
    [ObservableProperty]
    private bool isLoading;

    /// <summary>The full-page spinner, only until the first answer.</summary>
    [ObservableProperty]
    private bool isInitialLoading;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    [NotifyPropertyChangedFor(nameof(ShowsInlineError))]
    private string? errorMessage;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    [NotifyPropertyChangedFor(nameof(ShowsInlineError))]
    [NotifyPropertyChangedFor(nameof(ShowsCalendar))]
    [NotifyPropertyChangedFor(nameof(IsMonthEmpty))]
    private bool hasPage;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsCalendar))]
    [NotifyPropertyChangedFor(nameof(IsMonthEmpty))]
    [NotifyPropertyChangedFor(nameof(NotConfiguredMessage))]
    [NotifyPropertyChangedFor(nameof(CanOpenSettings))]
    private bool isNotConfigured;

    [ObservableProperty]
    private string monthLabel = "";

    /// <summary>The grid, a whole number of Sunday-to-Saturday weeks.</summary>
    [ObservableProperty]
    private IReadOnlyList<CalendarDayCell> cells = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsMonthEmpty))]
    private bool hasEntries;

    [ObservableProperty]
    private string emptyMonthMessage = "";

    public CalendarViewModel(AppModel model)
    {
        this.model = model;
    }

    public bool ShowsError => ErrorMessage != null && !HasPage;
    public bool ShowsInlineError => ErrorMessage != null && HasPage;
    public bool ShowsCalendar => HasPage && !IsNotConfigured;
    public bool IsMonthEmpty => HasPage && !IsNotConfigured && !HasEntries;

    private bool IsAdmin => model.Viewer?.IsAdmin == true;

    public string NotConfiguredMessage => IsAdmin
        ? "Connect Sonarr or Radarr to see upcoming releases and air dates here."
        : "The household admin hasn't connected Sonarr or Radarr yet.";

    /// <summary>Only an admin can connect an integration.</summary>
    public bool CanOpenSettings => IsNotConfigured && IsAdmin;

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

        IsLoading = true;
        IsInitialLoading = !HasPage;
        ErrorMessage = null;
        try
        {
            var fresh = await model.Api.Calendar.MonthAsync(month, token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            Apply(fresh);
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            ErrorMessage = error.Message;
        }
        finally
        {
            if (!token.IsCancellationRequested)
            {
                IsLoading = false;
                IsInitialLoading = false;
            }
        }
    }

    private void Apply(CalendarMonthResponse fresh)
    {
        page = fresh;
        MonthLabel = fresh.Month.Label;
        IsNotConfigured = !fresh.Configured;
        EmptyMonthMessage = $"Nothing scheduled in {fresh.Month.Label}.";
        var byDay = fresh.EntriesByDay;
        Cells = fresh.GridDays
            .Select(day => new CalendarDayCell(
                day,
                day == fresh.Today,
                CalendarMonth.Of(day) == fresh.Month,
                byDay.TryGetValue(day, out var entries)
                    ? entries.Select(entry => new CalendarEntryItem(entry, OpenEntryCommand)).ToList()
                    : []))
            .ToList();
        HasEntries = fresh.GridDays.Any(day => byDay.ContainsKey(day) && CalendarMonth.Of(day) == fresh.Month);
        HasPage = true;
    }

    // MARK: Month navigation

    /// <summary>"Today": back to the server's current month.</summary>
    [RelayCommand]
    private void ShowToday()
    {
        month = null;
        _ = LoadAsync();
    }

    [RelayCommand]
    private void ShowPrevious()
    {
        if (page is { } current)
        {
            month = current.PrevMonth;
            _ = LoadAsync();
        }
    }

    [RelayCommand]
    private void ShowNext()
    {
        if (page is { } current)
        {
            month = current.NextMonth;
            _ = LoadAsync();
        }
    }

    // MARK: Actions

    [RelayCommand]
    private void OpenEntry(CalendarEntryItem? entry)
    {
        if (entry != null)
        {
            model.OpenTitle(entry.TitleId);
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
        else if (e.PropertyName == nameof(AppModel.Viewer))
        {
            OnPropertyChanged(nameof(NotConfiguredMessage));
            OnPropertyChanged(nameof(CanOpenSettings));
        }
    }

    /// <summary>The library moved on the server, or an integration was connected: the month may have new entries.</summary>
    private void OnServerChanged(object? sender, ServerChangedEventArgs e)
    {
        var libraryMovedOnServer = e.Source == ServerChangeSource.Server && e.Change.HasFlag(ServerChange.Library);
        var integrationsChanged = e.Change.HasFlag(ServerChange.Integrations);
        if (!libraryMovedOnServer && !integrationsChanged)
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
