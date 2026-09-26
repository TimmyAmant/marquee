namespace Marquee.Windows.Views.Settings;

/// <summary>
/// One of Settings' tabs, hosted by <c>SettingsPage</c>: made the first time
/// its tab is picked and kept while the page lives. Only the tab on screen
/// is active, so a tab loads when it's shown and stops listening when
/// another is picked or Settings is left.
/// </summary>
public interface ISettingsTabView
{
    void Activate();

    void Deactivate();
}
