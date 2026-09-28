using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// One job: its name, what it does, its schedule, and Run now. What it did
/// when run from this PC is remembered while Settings is open (the server
/// keeps no run history of its own).
/// </summary>
public sealed partial class JobRow : ObservableObject
{
    private readonly AppModel model;
    private DateTimeOffset? finishedAt;

    public JobRow(AppModel model, Job job, bool showsDivider)
    {
        this.model = model;
        Id = job.Id;
        Name = job.Name;
        Description = job.Description;
        Schedule = job.Schedule;
        ShowsDivider = showsDivider;
        ShowsInterval = job.Interval != null;
        Apply(job);
    }

    // MARK: How often (0.58+)

    private JobInterval? saved;
    private JobInterval? defaultInterval;
    private DateTimeOffset? nextRunAt;
    private DateTimeOffset? lastRunAt;
    private bool applying;

    /// <summary>The server sends the schedule as something the admin can change (0.58+).</summary>
    public bool ShowsInterval { get; }

    /// <summary>"Every 5 minutes" … "Every 12 hours", "Once a day".</summary>
    public IReadOnlyList<string> IntervalChoices { get; } = JobInterval.MenuChoices.Select(choice => choice.MenuTitle).ToList();

    /// <summary>Two-way bound to the menu.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsDailyTime))]
    [NotifyPropertyChangedFor(nameof(CanSaveInterval))]
    [NotifyPropertyChangedFor(nameof(ShowsReset))]
    private int intervalIndex = -1;

    /// <summary>Two-way bound to the time picker, when "Once a day" is picked.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanSaveInterval))]
    [NotifyPropertyChangedFor(nameof(ShowsReset))]
    private TimeSpan dailyTime = new(3, 0, 0);

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanSaveInterval))]
    private bool isSavingInterval;

    /// <summary>"Next run Sep 27, 10:00 PM · last ran Sep 27, 8:00 PM".</summary>
    [ObservableProperty]
    private string nextRunLine = "";

    public bool ShowsDailyTime => Draft?.IsDaily == true;

    /// <summary>Save shows once the pick differs from what's saved.</summary>
    public bool CanSaveInterval => !IsSavingInterval && Draft is { } draft && !draft.SameAs(saved);

    /// <summary>"Back to the default": nothing changed, and the saved schedule isn't the default.</summary>
    public bool ShowsReset => Draft is { } draft && draft.SameAs(saved) && defaultInterval != null && !defaultInterval.SameAs(saved);

    private JobInterval? Draft
    {
        get
        {
            if (IntervalIndex < 0 || IntervalIndex >= JobInterval.MenuChoices.Count)
            {
                return null;
            }
            var choice = JobInterval.MenuChoices[IntervalIndex];
            return choice.IsDaily ? JobInterval.Daily(DailyTime.Hours, DailyTime.Minutes) : choice;
        }
    }

    private void Apply(Job job)
    {
        saved = job.Interval;
        defaultInterval = job.DefaultInterval;
        nextRunAt = job.NextRunAt;
        lastRunAt = job.LastRunAt;
        applying = true;
        if (saved != null)
        {
            IntervalIndex = JobInterval.MenuChoices.ToList().FindIndex(choice => choice.MenuKey == saved.MenuKey);
            if (saved.DailyAt is { } time)
            {
                DailyTime = new TimeSpan(time.Hour, time.Minute, 0);
            }
        }
        applying = false;
        NextRunLine = nextRunAt is not { } next
            ? ""
            : lastRunAt is { } last
                ? Loc.Format("Jobs_NextAndLastRun", Format.MonthDayTime(next), Format.MonthDayTime(last))
                : Loc.Format("Jobs_NextRun", Format.MonthDayTime(next));
        OnPropertyChanged(nameof(CanSaveInterval));
        OnPropertyChanged(nameof(ShowsReset));
    }

    [RelayCommand]
    private Task SaveIntervalAsync() => SetIntervalAsync(Draft);

    [RelayCommand]
    private Task ResetIntervalAsync() => SetIntervalAsync(null);

    /// <summary><c>PUT /settings/jobs/{id}</c>: the job moves to it straight away (null: its default).</summary>
    private async Task SetIntervalAsync(JobInterval? interval)
    {
        if (IsSavingInterval || applying)
        {
            return;
        }
        IsSavingInterval = true;
        Error = null;
        try
        {
            var job = await model.Api.AdminTools.SetJobIntervalAsync(Id, interval);
            Apply(job);
        }
        catch (ApiException failure)
        {
            Error = failure.Message;
        }
        finally
        {
            IsSavingInterval = false;
        }
    }

    // Internal: JobId is a Core type the XAML never binds.
    internal JobId Id { get; }

    public string Name { get; }
    public string Description { get; }

    /// <summary>"Every hour", "Daily at 3:00 AM".</summary>
    public string Schedule { get; }

    public bool ShowsDivider { get; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(RunLabel))]
    [NotifyPropertyChangedFor(nameof(CanRun))]
    private bool isRunning;

    /// <summary>"Ran from this PC 5m ago"; empty (collapsed) until it has.</summary>
    [ObservableProperty]
    private string ranLine = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    /// <summary>"Done." after a run from this PC that succeeded.</summary>
    [ObservableProperty]
    private bool isDone;

    public string RunLabel => IsRunning ? Loc.Get("Jobs_Running") : Loc.Get("Jobs_RunNow");
    public bool CanRun => !IsRunning;
    public bool HasError => Error != null;

    /// <summary><c>POST /settings/jobs/{id}/run</c>: waits until the job finishes; the schedule is unaffected.</summary>
    [RelayCommand]
    private async Task RunAsync()
    {
        if (IsRunning)
        {
            return;
        }
        IsRunning = true;
        Error = null;
        IsDone = false;
        finishedAt = null;
        RefreshTimes();
        try
        {
            await model.Api.Jobs.RunAsync(Id);
            finishedAt = DateTimeOffset.UtcNow;
            IsDone = true;
        }
        catch (ApiException failure)
        {
            Error = failure.Message;
        }
        finally
        {
            IsRunning = false;
            RefreshTimes();
        }
    }

    /// <summary>"5m ago" is relative to now.</summary>
    internal void RefreshTimes() =>
        RanLine = finishedAt is { } moment ? Loc.Format("Jobs_RanFromThisPc", NotificationItem.TimeAgoLabel(moment, DateTimeOffset.UtcNow)) : "";
}

/// <summary>
/// Settings › Jobs (app/settings/jobs/page.tsx, the Mac's
/// JobsSettingsView), the admin's: the server's maintenance jobs with their
/// schedules (<c>GET /settings/jobs</c>) and Run now.
/// </summary>
public sealed partial class JobsSettingsViewModel : ObservableObject
{
    private readonly AppModel model;
    private CancellationTokenSource? loadCancellation;
    private bool active;

    public JobsSettingsViewModel(AppModel model)
    {
        this.model = model;
    }

    /// <summary>Null until the first answer.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsEmpty))]
    [NotifyPropertyChangedFor(nameof(IsLoading))]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    [NotifyPropertyChangedFor(nameof(HasJobs))]
    private IReadOnlyList<JobRow>? rows;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsLoading))]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    private string? error;

    /// <summary>"This server reports no scheduled jobs."</summary>
    public bool IsEmpty => Rows is { Count: 0 };

    public bool HasJobs => Rows is { Count: > 0 };
    public bool IsLoading => Rows == null && Error == null;
    public bool ShowsError => Rows == null && Error != null;

    public void Activate()
    {
        if (active)
        {
            return;
        }
        active = true;
        model.PropertyChanged += OnModelPropertyChanged;
        foreach (var row in Rows ?? [])
        {
            row.RefreshTimes();
        }
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
        loadCancellation?.Cancel();
    }

    /// <summary>
    /// <c>GET /settings/jobs</c>. A job already listed keeps its row, so a
    /// run in progress or its result stays put across a reload.
    /// </summary>
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
            var jobs = await model.Api.Jobs.ListAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            var existing = (Rows ?? []).DistinctBy(row => row.Id).ToDictionary(row => row.Id);
            Rows = jobs
                .Select((job, index) => existing.TryGetValue(job.Id, out var row) && row.ShowsDivider == index > 0
                    ? row
                    : new JobRow(model, job, index > 0))
                .ToList();
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

    private void OnModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(AppModel.ReloadToken))
        {
            _ = LoadAsync();
        }
    }
}
