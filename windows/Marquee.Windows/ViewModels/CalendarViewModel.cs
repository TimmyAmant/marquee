using System.ComponentModel;
using System.Globalization;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// One title in a day of the calendar grid: its entries that day merged
/// (lib/calendar/group.ts), so four episodes of a show read as one
/// "S01E03–E06" row.
/// </summary>
public sealed class CalendarEntryItem
{
    private readonly Uri? posterUrl;
    private ImageSource? poster;

    public CalendarEntryItem(IReadOnlyList<CalendarEntry> entries, ICommand open)
    {
        var entry = entries[0];
        Name = entry.Name;
        Subtitle = MergedSubtitle(entries.Select(e => e.Subtitle).ToList());
        TitleId = entry.TitleId;
        posterUrl = entry.PosterPath.Url(ImageSize.W92);
        Open = open;
        AccessibleName = Loc.Format("Calendar_EntryAccessibleName", entry.Name, Subtitle);
    }

    /// <summary>A day's entries, one item per title, in the order each first appears.</summary>
    public static List<CalendarEntryItem> Group(IEnumerable<CalendarEntry> entries, ICommand open) =>
        entries
            .GroupBy(entry => (entry.TitleId.MediaType, entry.TitleId.TmdbId))
            .Select(group => new CalendarEntryItem(group.ToList(), open))
            .ToList();

    /// <summary>"S01E03–E06" for one season's run, else the codes joined with " · ".</summary>
    public static string MergedSubtitle(IReadOnlyList<string> codes)
    {
        if (codes.Count <= 1)
        {
            return codes.Count == 1 ? codes[0] : "";
        }
        var episodes = codes.Select(EpisodeCode).ToList();
        if (episodes.All(e => e != null) && episodes.Select(e => e!.Value.Season).Distinct().Count() == 1)
        {
            var numbers = episodes.Select(e => e!.Value.Episode).ToList();
            return string.Create(
                CultureInfo.InvariantCulture,
                $"S{episodes[0]!.Value.Season:00}E{numbers.Min():00}–E{numbers.Max():00}");
        }
        return string.Join(" · ", codes);
    }

    private static (int Season, int Episode)? EpisodeCode(string code)
    {
        var text = code.Trim().ToUpperInvariant();
        var split = text.IndexOf('E', StringComparison.Ordinal);
        if (!text.StartsWith('S') || split < 2
            || !int.TryParse(text.AsSpan(1, split - 1), NumberStyles.None, CultureInfo.InvariantCulture, out var season)
            || !int.TryParse(text.AsSpan(split + 1), NumberStyles.None, CultureInfo.InvariantCulture, out var episode))
        {
            return null;
        }
        return (season, episode);
    }

    public string Name { get; }

    /// <summary>"S01E03", "S01E03–E06", "In theaters", "Digital release" or "On disc".</summary>
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

    public string DayNumber { get; } = day.Day.ToString(CultureInfo.CurrentCulture);
    public bool IsToday { get; } = isToday;
    public double CellOpacity { get; } = inMonth ? 1 : 0.4;
    public IReadOnlyList<CalendarEntryItem> Entries { get; } = entries.Take(MaxVisible).ToList();

    /// <summary>The titles past <see cref="MaxVisible"/>: "+N more" opens them in a flyout.</summary>
    public IReadOnlyList<CalendarEntryItem> Overflow { get; } = entries.Skip(MaxVisible).ToList();
    public bool HasMore { get; } = entries.Count > MaxVisible;
    public string MoreText { get; } = entries.Count > MaxVisible ? Loc.Format("Calendar_More", entries.Count - MaxVisible) : "";
}

/// <summary>
/// app/calendar/page.tsx: the server's month grid of Radarr releases and
/// Sonarr air dates, in the server's time zone. Prev / Today / Next ask the
/// server for another month; nothing is computed locally.
/// </summary>
public sealed partial class CalendarViewModel : ObservableObject
{
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
        ? Loc.Get("Calendar_NotConfiguredAdmin")
        : Loc.Get("Calendar_NotConfiguredMember");

    // The weekday row over the grid (Sunday first, like the server's weeks), in the app's culture.
    public static string SundayLabel => WeekdayLabel(DayOfWeek.Sunday);
    public static string MondayLabel => WeekdayLabel(DayOfWeek.Monday);
    public static string TuesdayLabel => WeekdayLabel(DayOfWeek.Tuesday);
    public static string WednesdayLabel => WeekdayLabel(DayOfWeek.Wednesday);
    public static string ThursdayLabel => WeekdayLabel(DayOfWeek.Thursday);
    public static string FridayLabel => WeekdayLabel(DayOfWeek.Friday);
    public static string SaturdayLabel => WeekdayLabel(DayOfWeek.Saturday);

    private static string WeekdayLabel(DayOfWeek day) =>
        CultureInfo.CurrentCulture.DateTimeFormat.GetAbbreviatedDayName(day);

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
        EmptyMonthMessage = Loc.Format("Calendar_EmptyMonth", fresh.Month.Label);
        var byDay = fresh.EntriesByDay;
        Cells = fresh.GridDays
            .Select(day => new CalendarDayCell(
                day,
                day == fresh.Today,
                CalendarMonth.Of(day) == fresh.Month,
                byDay.TryGetValue(day, out var entries)
                    ? CalendarEntryItem.Group(entries, OpenEntryCommand)
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
    private void OpenSettings() => model.OpenSettings(SettingsTab.Services);

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
