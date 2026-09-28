using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using static Marquee.Windows.Views.Settings.AdminToolsUi;

namespace Marquee.Windows.Views.Settings;

/// <summary>
/// Settings › Notifications › Gotify, Slack or Pushbullet (0.58+; the
/// website's components/notification-channel-cards.tsx, the Mac's cards):
/// the channel's fields as rows, "Test &amp; save" (the server sends a test
/// first) and Remove. A blank secret keeps the saved one. An older server
/// doesn't report the channel, and the tab says so.
/// </summary>
public sealed partial class ServiceChannelView : UserControl, ISettingsTabView
{
    public enum Channel
    {
        Gotify,
        Slack,
        Pushbullet,
    }

    private readonly Channel channel;
    private readonly TextBox url = new();
    private readonly PasswordBox secret = new();
    private readonly TextBox extra = new();
    private readonly TextBlock state;
    private readonly TextBlock message;
    private readonly TextBlock error = ErrorText();
    private readonly Button save = new();
    private readonly Button remove = new();
    private readonly StackPanel form = new() { Spacing = 14 };
    private bool connected;

    public ServiceChannelView(Channel channel)
    {
        this.channel = channel;
        state = Caption("");
        message = Caption("");
        message.Visibility = Visibility.Collapsed;

        save.Content = Loc.Get("Channel_TestAndSave");
        save.Style = Resource<Style>("AccentButtonStyle");
        save.Click += async (_, _) => await SaveAsync();
        remove.Content = Loc.Get("Channel_Remove");
        remove.Click += async (_, _) => await RemoveAsync();

        var rows = new List<UIElement>();
        switch (channel)
        {
            case Channel.Gotify:
                url.Header = Loc.Get("Channel_GotifyServer");
                url.PlaceholderText = "https://gotify.example.com";
                secret.Header = Loc.Get("Channel_GotifyToken");
                secret.Description = Loc.Get("Channel_GotifyTokenHelp");
                extra.Header = Loc.Get("Channel_GotifyPriority");
                extra.Description = Loc.Get("Channel_GotifyPriorityHelp");
                extra.Text = "5";
                rows.Add(Row(url));
                rows.Add(Row(secret));
                rows.Add(Row(extra));
                break;
            case Channel.Slack:
                secret.Header = Loc.Get("Channel_SlackWebhook");
                secret.Description = Loc.Get("Channel_SlackWebhookHelp");
                secret.PlaceholderText = "https://hooks.slack.com/services/…";
                rows.Add(Row(secret));
                break;
            default:
                secret.Header = Loc.Get("Channel_PushbulletToken");
                secret.Description = Loc.Get("Channel_PushbulletTokenHelp");
                extra.Header = Loc.Get("Channel_PushbulletChannel");
                extra.Description = Loc.Get("Channel_PushbulletChannelHelp");
                rows.Add(Row(secret));
                rows.Add(Row(extra));
                break;
        }
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, Padding = new Thickness(20, 12, 20, 14) };
        buttons.Children.Add(save);
        buttons.Children.Add(remove);
        rows.Add(buttons);

        var title = channel switch
        {
            Channel.Gotify => Loc.Get("Channel_GotifyTitle"),
            Channel.Slack => Loc.Get("Channel_SlackTitle"),
            _ => Loc.Get("Channel_PushbulletTitle"),
        };
        var intro = channel switch
        {
            Channel.Gotify => Loc.Get("Channel_GotifyIntro"),
            Channel.Slack => Loc.Get("Channel_SlackIntro"),
            _ => Loc.Get("Channel_PushbulletIntro"),
        };
        form.Children.Add(Heading(title, intro, subtitle: false));
        form.Children.Add(state);
        form.Children.Add(Card([.. rows]));
        form.Children.Add(message);
        form.Children.Add(error);
        Content = form;
    }

    private string WireName => channel switch
    {
        Channel.Gotify => "gotify",
        Channel.Slack => "slack",
        _ => "pushbullet",
    };

    public void Activate() => _ = LoadAsync();

    public void Deactivate()
    {
    }

    private async Task LoadAsync()
    {
        try
        {
            var overview = await AppServices.Model.Api.Integrations.OverviewAsync();
            bool? isConnected = channel switch
            {
                Channel.Gotify => overview.Gotify?.Connected,
                Channel.Slack => overview.Slack?.Connected,
                _ => overview.Pushbullet?.Connected,
            };
            if (isConnected is not { } value)
            {
                form.Visibility = Visibility.Visible;
                Show(error, Loc.Get("Channel_Unsupported"));
                save.IsEnabled = false;
                return;
            }
            connected = value;
            if (channel == Channel.Gotify && overview.Gotify is { } gotify)
            {
                url.Text = gotify.Url ?? url.Text;
                extra.Text = (gotify.Priority ?? 5).ToString(System.Globalization.CultureInfo.CurrentCulture);
            }
            if (channel == Channel.Pushbullet && overview.Pushbullet is { } pushbullet)
            {
                extra.Text = pushbullet.ChannelTag ?? "";
            }
            UpdateState();
        }
        catch (ApiException failure)
        {
            if (!failure.IsCancellation)
            {
                Show(error, failure.Message);
            }
        }
    }

    private void UpdateState()
    {
        state.Text = connected ? Loc.Get("Channel_Connected") : Loc.Get("Channel_NotConnected");
        remove.Visibility = connected ? Visibility.Visible : Visibility.Collapsed;
        secret.PlaceholderText = connected ? Loc.Get("Channel_KeepSaved") : channel == Channel.Slack ? "https://hooks.slack.com/services/…" : "";
    }

    private object Request() => channel switch
    {
        Channel.Gotify => new GotifySettingRequest(
            url.Text.Trim(), secret.Password, int.TryParse(extra.Text.Trim(), out var priority) ? priority : 5),
        Channel.Slack => new SlackSettingRequest(secret.Password.Trim()),
        _ => new PushbulletSettingRequest(secret.Password.Trim(), extra.Text.Trim()),
    };

    private async Task SaveAsync()
    {
        save.IsEnabled = false;
        Show(error, null);
        message.Visibility = Visibility.Collapsed;
        try
        {
            await AppServices.Model.Api.AdminTools.SaveChannelAsync(WireName, Request());
            connected = true;
            secret.Password = "";
            message.Text = Loc.Get("Channel_Saved");
            message.Visibility = Visibility.Visible;
            UpdateState();
        }
        catch (ApiException failure)
        {
            Show(error, failure.Message);
        }
        finally
        {
            save.IsEnabled = true;
        }
    }

    private async Task RemoveAsync()
    {
        remove.IsEnabled = false;
        Show(error, null);
        try
        {
            await AppServices.Model.Api.AdminTools.RemoveChannelAsync(WireName);
            connected = false;
            secret.Password = "";
            message.Visibility = Visibility.Collapsed;
            UpdateState();
        }
        catch (ApiException failure)
        {
            Show(error, failure.Message);
        }
        finally
        {
            remove.IsEnabled = true;
        }
    }
}
