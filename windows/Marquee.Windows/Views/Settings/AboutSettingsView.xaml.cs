using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Views.Settings;

/// <summary>Settings › About: the server, this app's updates, and the server's facts.</summary>
public sealed partial class AboutSettingsView : UserControl, ISettingsTabView
{
    public AboutSettingsViewModel ViewModel { get; }

    /// <summary>The update row.</summary>
    public Updater Updater { get; } = AppServices.Updater;

    private bool stoppedTracking;

    public AboutSettingsView()
    {
        ViewModel = new AboutSettingsViewModel(AppServices.Model);
        InitializeComponent();
    }

    public void Activate()
    {
        ViewModel.Activate();
        if (stoppedTracking)
        {
            // Shown again: listen again.
            stoppedTracking = false;
            Bindings.Update();
        }
    }

    public void Deactivate()
    {
        ViewModel.Deactivate();
        // The OneWay bindings to the app-long Updater subscribe to it; let
        // them go while the tab isn't showing rather than pile up on it.
        Bindings.StopTracking();
        stoppedTracking = true;
    }

    private void OnCheckForUpdatesClick(object sender, RoutedEventArgs e) => _ = Updater.CheckAsync();

    private void OnInstallUpdateClick(object sender, RoutedEventArgs e) => _ = Updater.InstallAsync();

    /// <summary>"What's new" and "Download manually": the release's page on GitHub.</summary>
    private void OnReleaseNotesClick(object sender, RoutedEventArgs e) => _ = ExternalLinks.OpenAsync(Updater.ReleasePage);
}
