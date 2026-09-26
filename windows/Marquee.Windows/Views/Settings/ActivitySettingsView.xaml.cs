using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Views.Settings;

/// <summary>Settings › Activity, the admin's.</summary>
public sealed partial class ActivitySettingsView : UserControl, ISettingsTabView
{
    public ActivitySettingsViewModel ViewModel { get; }

    public ActivitySettingsView()
    {
        ViewModel = new ActivitySettingsViewModel(AppServices.Model);
        InitializeComponent();
    }

    public void Activate() => ViewModel.Activate();

    public void Deactivate() => ViewModel.Deactivate();
}
