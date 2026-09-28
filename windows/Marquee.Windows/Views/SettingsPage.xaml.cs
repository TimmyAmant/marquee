using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Marquee.Windows.Views.Settings;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace Marquee.Windows.Views;

/// <summary>
/// The Settings section, reached from the avatar on the rail (and its update
/// button, while a newer Marquee is out, which opens About). A host for the
/// tabs: the row of pills is made here for the tabs the viewer gets, each
/// tab's view is made the first time it's picked and kept while the page
/// lives, and only the one on screen is active.
/// </summary>
public sealed partial class SettingsPage : Page
{
    public SettingsViewModel ViewModel { get; }

    private readonly Dictionary<SettingsTab, UIElement> views = [];
    private readonly Dictionary<SettingsTab, Button> tabButtons = [];
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

    /// <summary>A tab button; its <c>Tag</c> is the tab.</summary>
    private void OnTabClick(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement { Tag: SettingsTab tab })
        {
            ViewModel.Select(tab);
        }
    }

    /// <summary>One pill per tab the viewer gets, in order; the current one solid.</summary>
    private void ShowTabs(SettingsTab current)
    {
        var visible = ViewModel.VisibleTabs;
        if (!visible.SequenceEqual(tabButtons.Keys))
        {
            TabBar.Children.Clear();
            tabButtons.Clear();
            foreach (var tab in visible)
            {
                var title = tab.Title();
                var button = new Button { Tag = tab, Content = new TextBlock { Text = title } };
                AutomationProperties.SetName(button, title);
                button.Click += OnTabClick;
                TabBar.Children.Add(button);
                tabButtons[tab] = button;
            }
        }
        foreach (var (tab, button) in tabButtons)
        {
            button.Style = tab == current ? currentTabStyle : tabStyle;
        }
    }

    /// <summary>Puts <see cref="SettingsViewModel.CurrentTab"/> on screen and marks its pill.</summary>
    private void ShowCurrentTab()
    {
        var tab = ViewModel.CurrentTab;
        ShowTabs(tab);

        if (!views.TryGetValue(tab, out var view))
        {
            view = MakeView(tab);
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

    private static UIElement MakeView(SettingsTab tab) => tab switch
    {
        SettingsTab.General => new IntegrationsSettingsView(SettingsPart.General),
        SettingsTab.Members => new CompositeSettingsView(
            new AccountSettingsView(SettingsPart.Members),
            new IntegrationsSettingsView(SettingsPart.SignIn)),
        SettingsTab.MediaServers => new IntegrationsSettingsView(SettingsPart.MediaServers),
        // 0.58+: override rules under the servers (hidden on an older server).
        SettingsTab.Services => new CompositeSettingsView(
            new IntegrationsSettingsView(SettingsPart.Services),
            new OverrideRulesView()),
        SettingsTab.Notifications => new NotificationsSettingsView(),
        // 0.53+: Region & language under the rows (hidden on an older server).
        SettingsTab.Discover => new CompositeSettingsView(
            new DiscoverSettingsView(),
            new DiscoverLocaleView()),
        SettingsTab.Blocklist => new CompositeSettingsView(
            new AccountSettingsView(SettingsPart.Blocklist),
            new AutoBlockView()),
        SettingsTab.Activity => new ActivitySettingsView(),
        // 0.46+: the Can't Find Check's wait under the jobs.
        SettingsTab.Jobs => new CompositeSettingsView(
            new JobsSettingsView(),
            new NotFoundHoursView()),
        SettingsTab.Logs => new LogsSettingsView(),
        SettingsTab.About => new AboutSettingsView(),
        _ => new AccountSettingsView(SettingsPart.Account),
    };
}
