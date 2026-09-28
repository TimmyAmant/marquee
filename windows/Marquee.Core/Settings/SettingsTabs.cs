using Marquee.Core.Localization;

namespace Marquee.Core.Settings;

/// <summary>
/// Settings' tabs across the top, in the website's order (lib/settings/tabs.ts)
/// and the Mac's (<c>SettingsTab</c> in SettingsRootView.swift).
/// </summary>
public enum SettingsTab
{
    Account,
    General,
    Members,
    MediaServers,
    Services,
    Notifications,

    /// <summary>Settings › Discover (0.49+): the household's Discover rows. Hidden on an older server.</summary>
    Discover,

    Blocklist,
    Jobs,
    Activity,
    About,

    /// <summary>Where the old Integrations tab's links go now ("Connect TMDb" from Search).</summary>
#pragma warning disable CA1069 // A deliberate alias of General.
    Integrations = General,
#pragma warning restore CA1069
}

/// <summary>Notifications' own tabs: yours, then (the admin's) one per household channel.</summary>
public enum NotificationsSubTab
{
    Personal,
    Household,
    Discord,
    Ntfy,
    Telegram,
    Pushover,
    Email,
    Webhook,
}

public static class SettingsTabs
{
    /// <summary>Every tab, in order (not <c>Enum.GetValues</c>: Integrations is General again).</summary>
    public static IReadOnlyList<SettingsTab> All { get; } =
    [
        SettingsTab.Account,
        SettingsTab.General,
        SettingsTab.Members,
        SettingsTab.MediaServers,
        SettingsTab.Services,
        SettingsTab.Notifications,
        SettingsTab.Discover,
        SettingsTab.Blocklist,
        SettingsTab.Jobs,
        SettingsTab.Activity,
        SettingsTab.About,
    ];

    public static IReadOnlyList<NotificationsSubTab> AllNotificationsSubTabs { get; } =
    [
        NotificationsSubTab.Personal,
        NotificationsSubTab.Household,
        NotificationsSubTab.Discord,
        NotificationsSubTab.Ntfy,
        NotificationsSubTab.Telegram,
        NotificationsSubTab.Pushover,
        NotificationsSubTab.Email,
        NotificationsSubTab.Webhook,
    ];

    public static string Title(this SettingsTab tab) => tab switch
    {
        SettingsTab.Account => Loc.Get("Nav_SettingsTabAccount"),
        SettingsTab.General => Loc.Get("Nav_SettingsTabGeneral"),
        SettingsTab.Members => Loc.Get("Nav_SettingsTabMembers"),
        SettingsTab.MediaServers => Loc.Get("Nav_SettingsTabMediaServers"),
        SettingsTab.Services => Loc.Get("Nav_SettingsTabServices"),
        SettingsTab.Notifications => Loc.Get("Nav_SettingsTabNotifications"),
        SettingsTab.Discover => Loc.Get("Nav_SettingsTabDiscover"),
        SettingsTab.Blocklist => Loc.Get("Nav_SettingsTabBlocklist"),
        SettingsTab.Jobs => Loc.Get("Nav_SettingsTabJobs"),
        SettingsTab.Activity => Loc.Get("Nav_SettingsTabActivity"),
        SettingsTab.About => Loc.Get("Nav_SettingsTabAbout"),
        _ => tab.ToString(),
    };

    public static string Title(this NotificationsSubTab tab) => tab switch
    {
        NotificationsSubTab.Personal => Loc.Get("Nav_NotificationsPersonal"),
        NotificationsSubTab.Household => Loc.Get("Nav_NotificationsHousehold"),
        NotificationsSubTab.Discord => Loc.Get("Nav_NotificationsDiscord"),
        NotificationsSubTab.Ntfy => Loc.Get("Nav_NotificationsNtfy"),
        NotificationsSubTab.Telegram => Loc.Get("Nav_NotificationsTelegram"),
        NotificationsSubTab.Pushover => Loc.Get("Nav_NotificationsPushover"),
        NotificationsSubTab.Email => Loc.Get("Nav_NotificationsEmail"),
        NotificationsSubTab.Webhook => Loc.Get("Nav_NotificationsWebhook"),
        _ => tab.ToString(),
    };

    /// <summary>
    /// Who sees a tab: everyone (Account, Notifications, About), whoever may
    /// manage the blocklist (the admin, or a member it was handed to), or the admin.
    /// </summary>
    public static bool IsVisible(this SettingsTab tab, bool isAdmin, bool canManageBlocklist) => tab switch
    {
        SettingsTab.Account or SettingsTab.Notifications or SettingsTab.About => true,
        SettingsTab.Blocklist => isAdmin || canManageBlocklist,
        _ => isAdmin,
    };

    /// <summary>The tabs this viewer gets, in order; Discover also needs a server that has it.</summary>
    public static IReadOnlyList<SettingsTab> Visible(bool isAdmin, bool canManageBlocklist, bool hasDiscover = true) =>
        All.Where(tab => tab.IsVisible(isAdmin, canManageBlocklist) && (tab != SettingsTab.Discover || hasDiscover)).ToList();

    /// <summary>The tab to show: one the viewer can't see (an old link, a demotion) lands on Account.</summary>
    public static SettingsTab Current(SettingsTab requested, IReadOnlyList<SettingsTab> visible) =>
        visible.Contains(requested) ? requested : SettingsTab.Account;

    public static IReadOnlyList<NotificationsSubTab> VisibleNotificationsSubTabs(bool isAdmin) =>
        isAdmin ? AllNotificationsSubTabs : [NotificationsSubTab.Personal];
}
