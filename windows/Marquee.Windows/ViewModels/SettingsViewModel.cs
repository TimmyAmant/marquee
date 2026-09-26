using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// Settings itself (app/settings/layout.tsx with components/settings-nav.tsx,
/// the Mac's SettingsRootView): which tabs the viewer gets (Integrations,
/// Activity and Jobs are the admin's) and which one shows. The tab lives on
/// <see cref="AppModel.SettingsTab"/>, so it's remembered while the app runs
/// and links elsewhere can pick it; each tab has its own view and model.
/// </summary>
public sealed partial class SettingsViewModel : ObservableObject
{
    private readonly AppModel model;
    private bool active;

    public SettingsViewModel(AppModel model)
    {
        this.model = model;
        IsAdmin = model.Viewer?.IsAdmin == true;
    }

    /// <summary>The admin's tabs show.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CurrentTab))]
    private bool isAdmin;

    /// <summary>The tab on screen: a member sent to an admin tab lands on Account.</summary>
    public SettingsTab CurrentTab => model.SettingsTab.Visible(IsAdmin);

    /// <summary>The page shows <see cref="CurrentTab"/>'s view (already on the UI thread).</summary>
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

    partial void OnIsAdminChanged(bool value) => CurrentTabChanged?.Invoke(this, EventArgs.Empty);

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
        }
    }
}
