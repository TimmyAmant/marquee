using CommunityToolkit.Mvvm.ComponentModel;
using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// Settings › Notifications › Household events (components/household-events-card.tsx,
/// the Mac's HouseholdEventsCard): which events the household's channels
/// post. Each box saves the moment it's ticked (<c>PUT /settings/notification-events</c>
/// with just that event); a failure puts it back. Hidden on a server older
/// than 0.45, which answers 404.
/// </summary>
public sealed partial class HouseholdEventsViewModel : ObservableObject
{
    private readonly AppModel model;
    private int saving;

    public HouseholdEventsViewModel(AppModel model)
    {
        this.model = model;
    }

    [ObservableProperty]
    private IReadOnlyList<HouseholdEventRow> rows = [];

    [ObservableProperty]
    private bool isVisible;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    [NotifyPropertyChangedFor(nameof(Status))]
    private string? error;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(Status))]
    private bool isSaving;

    public bool HasError => Error != null;

    /// <summary>"Saving…" while a box is on its way, or what went wrong.</summary>
    public string Status => Error ?? (IsSaving ? Loc.Get("HouseholdEvents_Saving") : "");

    public async Task LoadAsync()
    {
        try
        {
            var household = await model.Api.HouseholdNotificationEvents.GetAsync();
            if (saving == 0)
            {
                Show(household);
            }
            IsVisible = true;
        }
        catch (ApiException failure) when (failure.Kind is ApiErrorKind.NotFound or ApiErrorKind.Forbidden)
        {
            IsVisible = false;
        }
        catch (ApiException)
        {
            // Unreachable: the card stays as it was.
        }
    }

    private void Show(HouseholdNotificationEvents household) =>
        Rows = household.Events.Select(item => new HouseholdEventRow(this, item.Event, item.Label, item.Enabled)).ToList();

    internal async Task SaveAsync(HouseholdEventRow row, bool enabled)
    {
        Error = null;
        saving++;
        IsSaving = true;
        try
        {
            var answer = await model.Api.HouseholdNotificationEvents.SaveAsync(new Dictionary<string, bool> { [row.Event] = enabled });
            if (saving == 1)
            {
                Show(answer);
            }
        }
        catch (ApiException failure)
        {
            row.Reset(!enabled);
            Error = failure.Message;
        }
        finally
        {
            saving--;
            IsSaving = saving > 0;
        }
    }
}

/// <summary>One event and its box.</summary>
public sealed partial class HouseholdEventRow : ObservableObject
{
    private readonly HouseholdEventsViewModel owner;
    private bool quiet;

    public HouseholdEventRow(HouseholdEventsViewModel owner, string @event, string label, bool enabled)
    {
        this.owner = owner;
        Event = @event;
        Label = label;
        quiet = true;
        IsEnabled = enabled;
        quiet = false;
    }

    public string Event { get; }
    public string Label { get; }

    /// <summary>Nullable for the CheckBox's two-way <c>IsChecked</c>; never null here.</summary>
    [ObservableProperty]
    private bool? isEnabled;

    partial void OnIsEnabledChanged(bool? value)
    {
        if (!quiet)
        {
            _ = owner.SaveAsync(this, value == true);
        }
    }

    /// <summary>Puts the box back after a failed save, without saving again.</summary>
    internal void Reset(bool enabled)
    {
        quiet = true;
        IsEnabled = enabled;
        quiet = false;
    }
}
