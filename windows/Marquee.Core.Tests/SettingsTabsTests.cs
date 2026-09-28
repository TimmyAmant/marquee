using Marquee.Core.Settings;

namespace Marquee.Core.Tests;

/// <summary>Settings' tabs: the website's set and order (lib/settings/tabs.ts), the Mac's, and who sees which.</summary>
public sealed class SettingsTabsTests
{
    [Fact]
    public void TheTabsComeInTheWebsitesOrder()
    {
        Assert.Equal(
            new[]
            {
                SettingsTab.Account, SettingsTab.General, SettingsTab.Members, SettingsTab.MediaServers,
                SettingsTab.Services, SettingsTab.Notifications, SettingsTab.Discover, SettingsTab.Blocklist,
                SettingsTab.Jobs, SettingsTab.Activity, SettingsTab.About,
            },
            SettingsTabs.All);
    }

    [Fact]
    public void TheAdminSeesEveryTab() =>
        Assert.Equal(SettingsTabs.All, SettingsTabs.Visible(isAdmin: true, canManageBlocklist: true));

    [Fact]
    public void AMemberSeesOnlyTheirOwnTabs() =>
        Assert.Equal(
            new[] { SettingsTab.Account, SettingsTab.Notifications, SettingsTab.About },
            SettingsTabs.Visible(isAdmin: false, canManageBlocklist: false));

    [Fact]
    public void AMemberHandedTheBlocklistSeesItAndNothingElseOfTheAdmins() =>
        Assert.Equal(
            new[] { SettingsTab.Account, SettingsTab.Notifications, SettingsTab.Blocklist, SettingsTab.About },
            SettingsTabs.Visible(isAdmin: false, canManageBlocklist: true));

    [Fact]
    public void DiscoverHidesOnAnOlderServer() =>
        Assert.DoesNotContain(SettingsTab.Discover, SettingsTabs.Visible(isAdmin: true, canManageBlocklist: true, hasDiscover: false));

    [Fact]
    public void ATabTheViewerCantSeeLandsOnAccount()
    {
        var member = SettingsTabs.Visible(isAdmin: false, canManageBlocklist: false);
        Assert.Equal(SettingsTab.Account, SettingsTabs.Current(SettingsTab.Services, member));
        Assert.Equal(SettingsTab.Notifications, SettingsTabs.Current(SettingsTab.Notifications, member));
    }

    [Fact]
    public void TheOldIntegrationsLinkOpensGeneral() => Assert.Equal(SettingsTab.General, SettingsTab.Integrations);

    [Fact]
    public void NotificationsSubTabs()
    {
        Assert.Equal(new[] { NotificationsSubTab.Personal }, SettingsTabs.VisibleNotificationsSubTabs(isAdmin: false));
        Assert.Equal(
            new[]
            {
                NotificationsSubTab.Personal, NotificationsSubTab.Household, NotificationsSubTab.Discord, NotificationsSubTab.Ntfy,
                NotificationsSubTab.Telegram, NotificationsSubTab.Pushover, NotificationsSubTab.Email, NotificationsSubTab.Webhook,
            },
            SettingsTabs.VisibleNotificationsSubTabs(isAdmin: true));
    }
}
