using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using Marquee.Core.Api;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// Settings itself (app/settings/layout.tsx with components/settings-nav.tsx,
/// the Mac's SettingsRootView): which tabs the viewer gets
/// (<see cref="SettingsTabs.Visible"/>: everyone has Account, Notifications
/// and About; Blocklist whoever may manage it; the rest the admin) and which
/// one shows. The tab lives on <see cref="AppModel.SettingsTab"/>, so it's
/// remembered while the app runs and links elsewhere can pick it; each tab
/// has its own view and model. Discover shows once the server answered
/// <c>GET /settings/discover</c> (0.49+; an older one answers 404 and the
/// tab stays hidden).
/// </summary>
public sealed partial class SettingsViewModel : ObservableObject
{
    private readonly AppModel model;
    private bool active;

    /// <summary>The server and account Discover was last asked about; a sign-in elsewhere asks again.</summary>
    private string? probedFor;

    public SettingsViewModel(AppModel model)
    {
        this.model = model;
        IsAdmin = model.Viewer?.IsAdmin == true;
        CanManageBlocklist = model.Viewer?.Can?.ManageBlocklist == true;
    }

    /// <summary>The admin's tabs show.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CurrentTab))]
    [NotifyPropertyChangedFor(nameof(VisibleTabs))]
    private bool isAdmin;

    /// <summary>The Blocklist tab shows for a member the admin handed it to (0.48+).</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CurrentTab))]
    [NotifyPropertyChangedFor(nameof(VisibleTabs))]
    private bool canManageBlocklist;

    /// <summary>The server has Settings › Discover (0.49+).</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CurrentTab))]
    [NotifyPropertyChangedFor(nameof(VisibleTabs))]
    private bool hasDiscoverSettings;

    /// <summary>The tabs across the top, in order.</summary>
    public IReadOnlyList<SettingsTab> VisibleTabs => SettingsTabs.Visible(IsAdmin, CanManageBlocklist, HasDiscoverSettings);

    /// <summary>The tab on screen: one the viewer can't see (an old link, a demotion) lands on Account.</summary>
    public SettingsTab CurrentTab => SettingsTabs.Current(model.SettingsTab, VisibleTabs);

    /// <summary>The page shows <see cref="CurrentTab"/>'s view and the tab row (already on the UI thread).</summary>
    public event EventHandler? CurrentTabChanged;

    /// <summary>A tab button: remembered for the rest of the run.</summary>
    public void Select(SettingsTab tab) => model.SettingsTab = tab;

    public void Activate()
    {
        if (active)
        {
            return;
        }
        active = true;
        model.PropertyChanged += OnModelPropertyChanged;
        IsAdmin = model.Viewer?.IsAdmin == true;
        CanManageBlocklist = model.Viewer?.Can?.ManageBlocklist == true;
        _ = ProbeDiscoverSettingsAsync();
    }

    public void Deactivate()
    {
        if (!active)
        {
            return;
        }
        active = false;
        model.PropertyChanged -= OnModelPropertyChanged;
    }

    partial void OnIsAdminChanged(bool value)
    {
        CurrentTabChanged?.Invoke(this, EventArgs.Empty);
        _ = ProbeDiscoverSettingsAsync();
    }

    partial void OnCanManageBlocklistChanged(bool value) => CurrentTabChanged?.Invoke(this, EventArgs.Empty);

    partial void OnHasDiscoverSettingsChanged(bool value) => CurrentTabChanged?.Invoke(this, EventArgs.Empty);

    /// <summary>
    /// Whether the server has Settings › Discover, asked once per server and
    /// account (the admin's only). A 404 keeps the tab hidden; a failure
    /// asks again next time Settings opens.
    /// </summary>
    private async Task ProbeDiscoverSettingsAsync()
    {
        if (!IsAdmin)
        {
            return;
        }
        var identity = $"{model.Session.Server?.BaseUrlString}|{model.Viewer?.Id}";
        if (probedFor == identity)
        {
            return;
        }
        probedFor = identity;
        try
        {
            var settings = await model.Api.DiscoverSettings.GetAsync();
            HasDiscoverSettings = settings != null;
        }
        catch (ApiException)
        {
            probedFor = null;
        }
    }

    private void OnModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(AppModel.SettingsTab))
        {
            OnPropertyChanged(nameof(CurrentTab));
            CurrentTabChanged?.Invoke(this, EventArgs.Empty);
        }
        else if (e.PropertyName == nameof(AppModel.Viewer) && model.Viewer is { } viewer)
        {
            // A promotion (or demotion) adds or takes away the admin's tabs.
            IsAdmin = viewer.IsAdmin;
            CanManageBlocklist = viewer.Can?.ManageBlocklist == true;
            _ = ProbeDiscoverSettingsAsync();
        }
    }
}
