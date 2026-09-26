using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Views.Settings;

/// <summary>Settings › Jobs, the admin's.</summary>
public sealed partial class JobsSettingsView : UserControl, ISettingsTabView
{
    public JobsSettingsViewModel ViewModel { get; }

    public JobsSettingsView()
    {
        ViewModel = new JobsSettingsViewModel(AppServices.Model);
        InitializeComponent();
    }

    public void Activate() => ViewModel.Activate();

    public void Deactivate() => ViewModel.Deactivate();
}
