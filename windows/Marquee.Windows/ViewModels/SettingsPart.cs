namespace Marquee.Windows.ViewModels;

/// <summary>
/// Which part of Settings a view shows. The Account view holds Account,
/// Members, your own Notifications and the Blocklist; the Integrations view
/// holds General, Media servers, Services, single sign-on (under Members) and
/// one household channel at a time (under Notifications). Each tab makes its
/// own view for its part, the Mac's and the website's tab set.
/// </summary>
public enum SettingsPart
{
    Account,
    Members,
    Notifications,
    Blocklist,
    General,
    MediaServers,
    Services,
    SignIn,
    HouseholdEvents,
    Discord,
    Ntfy,
    Telegram,
    Pushover,
    Email,
    Webhook,
}

public static class SettingsPartExtensions
{
    /// <summary>The household channel a Notifications sub-tab shows (Personal has none: it's the Account view's).</summary>
    public static SettingsPart Part(this NotificationsSubTab tab) => tab switch
    {
        NotificationsSubTab.Household => SettingsPart.HouseholdEvents,
        NotificationsSubTab.Discord => SettingsPart.Discord,
        NotificationsSubTab.Ntfy => SettingsPart.Ntfy,
        NotificationsSubTab.Telegram => SettingsPart.Telegram,
        NotificationsSubTab.Pushover => SettingsPart.Pushover,
        NotificationsSubTab.Email => SettingsPart.Email,
        NotificationsSubTab.Webhook => SettingsPart.Webhook,
        _ => SettingsPart.Notifications,
    };

    /// <summary>One household channel, shown under Notifications without the Integrations heading.</summary>
    public static bool IsChannel(this SettingsPart part) =>
        part is SettingsPart.HouseholdEvents or SettingsPart.Discord or SettingsPart.Ntfy or SettingsPart.Telegram
            or SettingsPart.Pushover or SettingsPart.Email or SettingsPart.Webhook;
}
