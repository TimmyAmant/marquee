using Marquee.Core.Localization;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;

namespace Marquee.Windows.Views.Settings;

/// <summary>
/// Settings › Notifications (app/settings/notifications, the Mac's
/// NotificationsSettingsView): the heading, then for the admin a row of
/// tabs — yours, then one per household channel — and the chosen one below.
/// Yours is the Account view's Notifications part; each channel is the
/// Integrations view's part for it. A member has only their own and no row.
/// </summary>
public sealed partial class NotificationsSettingsView : UserControl, ISettingsTabView
{
    private readonly Dictionary<NotificationsSubTab, UIElement> views = [];
    private readonly StackPanel tabBar = new() { Orientation = Orientation.Horizontal, Spacing = 6 };
    private readonly ScrollViewer tabRow;
    private readonly ContentPresenter content = new() { HorizontalContentAlignment = HorizontalAlignment.Stretch };
    private NotificationsSubTab current = NotificationsSubTab.Personal;
    private ISettingsTabView? shown;
    private bool active;

    public NotificationsSettingsView()
    {
        tabRow = new ScrollViewer
        {
            Content = tabBar,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Hidden,
            HorizontalScrollMode = ScrollMode.Enabled,
            VerticalScrollBarVisibility = ScrollBarVisibility.Disabled,
            VerticalScrollMode = ScrollMode.Disabled,
        };
        var heading = new StackPanel { Spacing = 4 };
        heading.Children.Add(new TextBlock
        {
            Text = Loc.Get("Settings_NotificationsHeading"),
            Style = (Style)Application.Current.Resources["SubtitleTextBlockStyle"],
        });
        heading.Children.Add(new TextBlock
        {
            Text = Loc.Get("Settings_NotificationsIntro"),
            Style = (Style)Application.Current.Resources["CaptionTextBlockStyle"],
            TextWrapping = TextWrapping.Wrap,
            Foreground = (Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["TextFillColorSecondaryBrush"],
        });
        var stack = new StackPanel { Spacing = 20 };
        stack.Children.Add(heading);
        stack.Children.Add(tabRow);
        stack.Children.Add(content);
        Content = stack;
    }

    public void Activate()
    {
        active = true;
        Show();
        shown?.Activate();
    }

    /// <summary>Swaps the sub-tab's view in; the caller activates it.</summary>

    public void Deactivate()
    {
        active = false;
        shown?.Deactivate();
    }

    private void Show()
    {
        var tabs = SettingsTabs.VisibleNotificationsSubTabs(AppServices.Model.Viewer?.IsAdmin == true);
        if (!tabs.Contains(current))
        {
            current = NotificationsSubTab.Personal;
        }

        tabRow.Visibility = tabs.Count > 1 ? Visibility.Visible : Visibility.Collapsed;
        tabBar.Children.Clear();
        foreach (var tab in tabs)
        {
            var title = tab.Title();
            var button = new ToggleButton
            {
                Content = title,
                Tag = tab,
                IsChecked = tab == current,
                CornerRadius = new CornerRadius(14),
                Padding = new Thickness(12, 4, 12, 5),
            };
            AutomationProperties.SetName(button, title);
            button.Click += OnSubTabClick;
            tabBar.Children.Add(button);
        }

        if (!views.TryGetValue(current, out var view))
        {
            view = current switch
            {
                NotificationsSubTab.Personal => new AccountSettingsView(SettingsPart.Notifications),
                // 0.58+: built in code (ServiceChannelView).
                NotificationsSubTab.Gotify => new ServiceChannelView(ServiceChannelView.Channel.Gotify),
                NotificationsSubTab.Slack => new ServiceChannelView(ServiceChannelView.Channel.Slack),
                NotificationsSubTab.Pushbullet => new ServiceChannelView(ServiceChannelView.Channel.Pushbullet),
                _ => new IntegrationsSettingsView(current.Part()),
            };
            views[current] = view;
        }
        if (ReferenceEquals(content.Content, view))
        {
            return;
        }
        if (active)
        {
            shown?.Deactivate();
        }
        content.Content = view;
        shown = view as ISettingsTabView;
    }

    private void OnSubTabClick(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement { Tag: NotificationsSubTab tab })
        {
            var changed = tab != current;
            current = tab;
            Show();
            if (changed && active)
            {
                shown?.Activate();
            }
        }
    }
}
