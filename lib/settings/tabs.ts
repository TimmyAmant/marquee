import type { MessageKey } from "../i18n/translator";

// Settings' tabs, in order, and who sees each one — the one list the tab
// bar (components/settings-nav.tsx), the pages' guards and next.config.ts's
// redirects share. The Mac (SettingsTab in SettingsRootView.swift) and
// Windows (Marquee.Core/Settings/SettingsTabs.cs) apps keep the same set in
// the same order.
//
// Kept free of server imports: next.config.ts reads the redirects below.

export type SettingsTabId =
  | "account"
  | "general"
  | "members"
  | "media-servers"
  | "services"
  | "notifications"
  | "discover"
  | "blocklist"
  | "jobs"
  | "logs"
  | "activity"
  | "about";

/** Who gets a tab: everyone, the admin, or whoever may manage the blocklist
 * (the admin, or a member it was handed to — lib/users/permissions.ts). */
export type SettingsTabAccess = "everyone" | "admin" | "manageBlocklist";

export type SettingsTab = {
  id: SettingsTabId;
  href: string;
  label: MessageKey;
  access: SettingsTabAccess;
};

export const SETTINGS_TABS: readonly SettingsTab[] = [
  { id: "account", href: "/settings", label: "nav.settingsAccount", access: "everyone" },
  { id: "general", href: "/settings/general", label: "nav.settingsGeneral", access: "admin" },
  { id: "members", href: "/settings/members", label: "nav.settingsMembers", access: "admin" },
  { id: "media-servers", href: "/settings/media-servers", label: "nav.settingsMediaServers", access: "admin" },
  { id: "services", href: "/settings/services", label: "nav.settingsServices", access: "admin" },
  { id: "notifications", href: "/settings/notifications", label: "nav.settingsNotifications", access: "everyone" },
  { id: "discover", href: "/settings/discover", label: "nav.settingsDiscover", access: "admin" },
  { id: "blocklist", href: "/settings/blocklist", label: "nav.settingsBlocklist", access: "manageBlocklist" },
  { id: "jobs", href: "/settings/jobs", label: "nav.settingsJobs", access: "admin" },
  { id: "logs", href: "/settings/logs", label: "nav.settingsLogs", access: "admin" },
  { id: "activity", href: "/settings/activity", label: "nav.settingsActivity", access: "admin" },
  { id: "about", href: "/settings/about", label: "nav.settingsAbout", access: "everyone" },
];

export type SettingsViewer = { isAdmin: boolean; canManageBlocklist: boolean };

export function canSeeSettingsTab(tab: Pick<SettingsTab, "access">, viewer: SettingsViewer): boolean {
  switch (tab.access) {
    case "everyone":
      return true;
    case "admin":
      return viewer.isAdmin;
    case "manageBlocklist":
      return viewer.isAdmin || viewer.canManageBlocklist;
  }
}

/** The tabs this viewer gets, in order. */
export function visibleSettingsTabs(viewer: SettingsViewer): SettingsTab[] {
  return SETTINGS_TABS.filter((tab) => canSeeSettingsTab(tab, viewer));
}

/** The tab a path belongs to: its own page or one under it
 * (Notifications › Discord keeps Notifications lit). Account only for
 * /settings itself. */
export function settingsTabForPath(pathname: string, tabs: readonly SettingsTab[] = SETTINGS_TABS): SettingsTab | undefined {
  const path = pathname.replace(/\/+$/, "") || "/";
  return tabs.find((tab) => tab.href === path || (tab.href !== "/settings" && path.startsWith(`${tab.href}/`)));
}

// Notifications' sub-tabs (Seerr's per-agent tabs): your own first, then
// the household's channels, the admin's.

export type NotificationAgentId =
  | "household"
  | "discord"
  | "ntfy"
  | "telegram"
  | "pushover"
  | "email"
  | "gotify"
  | "slack"
  | "pushbullet"
  | "webhook";

export type NotificationSubTab = {
  id: "personal" | NotificationAgentId;
  href: string;
  label: MessageKey;
  adminOnly: boolean;
};

export const NOTIFICATION_AGENTS: readonly NotificationAgentId[] = [
  "household",
  "discord",
  "ntfy",
  "telegram",
  "pushover",
  "email",
  "gotify",
  "slack",
  "pushbullet",
  "webhook",
];

const AGENT_LABELS: Record<NotificationAgentId, MessageKey> = {
  household: "nav.notificationsHousehold",
  discord: "nav.notificationsDiscord",
  ntfy: "nav.notificationsNtfy",
  telegram: "nav.notificationsTelegram",
  pushover: "nav.notificationsPushover",
  email: "nav.notificationsEmail",
  gotify: "nav.notificationsGotify",
  slack: "nav.notificationsSlack",
  pushbullet: "nav.notificationsPushbullet",
  webhook: "nav.notificationsWebhook",
};

export const NOTIFICATION_SUB_TABS: readonly NotificationSubTab[] = [
  { id: "personal", href: "/settings/notifications", label: "nav.notificationsPersonal", adminOnly: false },
  ...NOTIFICATION_AGENTS.map((id) => ({
    id,
    href: `/settings/notifications/${id}`,
    label: AGENT_LABELS[id],
    adminOnly: true,
  })),
];

export function isNotificationAgent(value: string): value is NotificationAgentId {
  return (NOTIFICATION_AGENTS as readonly string[]).includes(value);
}

export function visibleNotificationSubTabs(isAdmin: boolean): NotificationSubTab[] {
  return NOTIFICATION_SUB_TABS.filter((tab) => isAdmin || !tab.adminOnly);
}

/** The pages Settings used to have, and where each now lives. Redirects,
 * not rewrites, so a bookmark or an older app's link lands on the new
 * address. Temporary (307): the old paths may be reused one day. */
export const LEGACY_SETTINGS_REDIRECTS: readonly { source: string; destination: string }[] = [
  { source: "/settings/integrations", destination: "/settings/media-servers" },
  // The Mac and Windows apps open the importer at its old address.
  { source: "/settings/integrations/import-seerr", destination: "/settings/general/import-seerr" },
  { source: "/settings/users", destination: "/settings/members" },
];
