import type { MessageKey } from "@/lib/i18n/translator";

/**
 * The website's tab bar on phone-sized windows (components/phone-tab-bar.tsx),
 * after the iPhone app's (mac/MarqueeiOS/App/PhoneTab.swift): Discover,
 * Search, Requests, Calendar, More, in that order, with the rail's other
 * sections under More. Kept apart from the component so which tabs and More
 * rows show, and which is lit, can be tested without a browser.
 */

export type PhoneTabId = "discover" | "search" | "requests" | "calendar" | "more";

export type PhoneIconName =
  | "discover"
  | "search"
  | "requests"
  | "calendar"
  | "more"
  | "movies"
  | "series"
  | "library"
  | "favorites"
  | "settings"
  | "releases"
  | "errors";

export type PhoneTab = {
  id: PhoneTabId;
  /** Where the tab goes; More opens a sheet instead. */
  href: string | null;
  label: MessageKey;
  icon: PhoneIconName;
};

export type MoreItem = { href: string; label: MessageKey; icon: PhoneIconName };

export const PHONE_TABS: readonly PhoneTab[] = [
  { id: "discover", href: "/discover", label: "nav.discover", icon: "discover" },
  { id: "search", href: "/search", label: "common.search", icon: "search" },
  { id: "requests", href: "/requests", label: "nav.requests", icon: "requests" },
  { id: "calendar", href: "/calendar", label: "nav.calendar", icon: "calendar" },
  { id: "more", href: null, label: "nav.more", icon: "more" },
];

/** More's rows, in groups: the rail's sections without a tab, then
 * Settings, then the pages the footer links to. */
export const MORE_GROUPS: readonly (readonly MoreItem[])[] = [
  [
    { href: "/movies", label: "common.movies", icon: "movies" },
    { href: "/series", label: "common.series", icon: "series" },
    { href: "/library", label: "nav.library", icon: "library" },
    { href: "/favorites", label: "nav.favorites", icon: "favorites" },
  ],
  [{ href: "/settings", label: "nav.settings", icon: "settings" }],
  [
    { href: "/changelog", label: "nav.releasesTitle", icon: "releases" },
    { href: "/help/errors", label: "nav.errorReference", icon: "errors" },
  ],
];

/** The tabs for this visitor. Signed out there's nothing to show them — every
 * page but sign-in and first-run setup sends them to sign in — so no bar. */
export function phoneTabsFor(isSignedIn: boolean): readonly PhoneTab[] {
  return isSignedIn ? PHONE_TABS : [];
}

/** More's rows for this visitor (none signed out, like the tabs). Every
 * signed-in account sees the same sections the rail shows it. */
export function moreGroupsFor(isSignedIn: boolean): readonly (readonly MoreItem[])[] {
  return isSignedIn ? MORE_GROUPS : [];
}

/** Whether `pathname` is `href` or a page under it. */
export function isUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Whether the bar shows on this page at all: not on sign-in or setup. */
export function showsPhoneTabs(isSignedIn: boolean, pathname: string): boolean {
  if (!isSignedIn) return false;
  return !["/login", "/setup"].some((href) => isUnder(pathname, href));
}

/**
 * The tab lit for `pathname`: the tab whose section it is, More for the
 * sections under More, and none for pages that belong to no section (a
 * title, a person), which are reached from any tab.
 */
export function activePhoneTab(pathname: string): PhoneTabId | null {
  if (pathname === "/") return "discover";
  for (const tab of PHONE_TABS) {
    if (tab.href && isUnder(pathname, tab.href)) return tab.id;
  }
  if (MORE_GROUPS.some((group) => group.some((item) => isUnder(pathname, item.href)))) return "more";
  return null;
}
