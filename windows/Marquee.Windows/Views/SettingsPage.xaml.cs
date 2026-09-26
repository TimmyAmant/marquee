using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Marquee.Windows.Views.Settings;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace Marquee.Windows.Views;

/// <summary>
/// The Settings section, reached from the avatar on the rail (and its update
/// button, while a newer Marquee is out, which opens About). A host for the
/// tabs: each tab's view is made the first time it's picked and kept while
/// the page lives, and only the one on screen is active.
/// </summary>
public sealed partial class SettingsPage : Page
{
    public SettingsViewModel ViewModel { get; }

    private readonly Dictionary<SettingsTab, UIElement> views = [];
    private readonly Style tabStyle;
    private readonly Style currentTabStyle;
    private ISettingsTabView? shown;
    private bool onScreen;

    public SettingsPage()
    {
        ViewModel = new SettingsViewModel(AppServices.Model);
        InitializeComponent();
        tabStyle = (Style)Resources["SettingsTabStyle"];
        currentTabStyle = (Style)Resources["SettingsTabCurrentStyle"];
        ViewModel.CurrentTabChanged += (_, _) => ShowCurrentTab();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        ViewModel.Activate();
        ShowCurrentTab();
        onScreen = true;
        shown?.Activate();
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e)
    {
        base.OnNavigatedFrom(e);
        onScreen = false;
        ViewModel.Deactivate();
        shown?.Deactivate();
    }

    /// <summary>A tab button; its <c>Tag</c> names the tab.</summary>
    private void OnTabClick(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement { Tag: string tag } && Enum.TryParse<SettingsTab>(tag, out var tab))
        {
            ViewModel.Select(tab);
        }
    }

    /// <summary>Puts <see cref="SettingsViewModel.CurrentTab"/> on screen and marks its pill.</summary>
    private void ShowCurrentTab()
    {
        var tab = ViewModel.CurrentTab;
        AccountTabButton.Style = tab == SettingsTab.Account ? currentTabStyle : tabStyle;
        IntegrationsTabButton.Style = tab == SettingsTab.Integrations ? currentTabStyle : tabStyle;
        ActivityTabButton.Style = tab == SettingsTab.Activity ? currentTabStyle : tabStyle;
        JobsTabButton.Style = tab == SettingsTab.Jobs ? currentTabStyle : tabStyle;
        AboutTabButton.Style = tab == SettingsTab.About ? currentTabStyle : tabStyle;

        if (!views.TryGetValue(tab, out var view))
        {
            view = tab switch
            {
                SettingsTab.Integrations => new IntegrationsSettingsView(),
                SettingsTab.Activity => new ActivitySettingsView(),
                SettingsTab.Jobs => new JobsSettingsView(),
                SettingsTab.About => new AboutSettingsView(),
                _ => new AccountSettingsView(),
            };
            views[tab] = view;
        }
        if (ReferenceEquals(TabContent.Content, view))
        {
            return;
        }
        if (onScreen)
        {
            shown?.Deactivate();
        }
        TabContent.Content = view;
        shown = view as ISettingsTabView;
        if (onScreen)
        {
            shown?.Activate();
        }
    }
}
