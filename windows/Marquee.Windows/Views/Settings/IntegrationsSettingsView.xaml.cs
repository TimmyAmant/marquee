using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Views.Settings;

/// <summary>Settings › Integrations, the admin's.</summary>
public sealed partial class IntegrationsSettingsView : UserControl, ISettingsTabView
{
    public IntegrationsSettingsViewModel ViewModel { get; }

    public IntegrationsSettingsView()
    {
        ViewModel = new IntegrationsSettingsViewModel(AppServices.Model);
        InitializeComponent();
    }

    public void Activate() => ViewModel.Activate();

    public void Deactivate() => ViewModel.Deactivate();
}
