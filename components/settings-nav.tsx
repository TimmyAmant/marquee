"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n/client";
import {
  settingsTabForPath,
  visibleNotificationSubTabs,
  visibleSettingsTabs,
  type SettingsViewer,
} from "@/lib/settings/tabs";

/** A pill in a row of tabs: solid for the current one (the Mac and Windows
 * apps' Settings tabs look the same). */
function TabLink({ href, current, children }: { href: string; current: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLAnchorElement>(null);
  // On a phone the row scrolls sideways: keep the current tab in view.
  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);
  return (
    <Link
      ref={ref}
      href={href}
      aria-current={current ? "page" : undefined}
      className={`flex h-8 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition-colors ${
        current ? "bg-text-primary text-bg-0" : "text-text-secondary hover:bg-text-primary/10 hover:text-text-primary"
      }`}
    >
      {children}
    </Link>
  );
}

/**
 * Owns the whole settings shell ("Settings", the tab bar, the page) as one
 * client component since the current tab comes from usePathname().
 * `children` is server-rendered content from SettingsLayout, passed
 * through a client boundary, which Next.js supports natively. The tabs
 * and who sees each come from lib/settings/tabs.ts.
 */
export function SettingsNav({ viewer, children }: { viewer: SettingsViewer; children: React.ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const tabs = visibleSettingsTabs(viewer);
  const current = settingsTabForPath(pathname, tabs);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-display text-3xl text-text-primary">{t("nav.settings")}</h1>
      <nav aria-label={t("nav.settings")} className="-mx-4 mt-6 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <div className="flex w-max min-w-full gap-1.5 border-b border-border pb-3">
          {tabs.map((tab) => (
            <TabLink key={tab.id} href={tab.href} current={tab.id === current?.id}>
              {t(tab.label)}
            </TabLink>
          ))}
        </div>
      </nav>
      <div className="mt-8">{children}</div>
    </div>
  );
}

/** Notifications' own tabs (yours, then each household channel), the
 * admin's only: a member has just their own and sees no row. */
export function NotificationsSubNav({ isAdmin }: { isAdmin: boolean }) {
  const t = useT();
  const pathname = usePathname().replace(/\/+$/, "");
  const tabs = visibleNotificationSubTabs(isAdmin);
  if (tabs.length < 2) return null;
  return (
    <nav
      aria-label={t("nav.settingsNotifications")}
      className="-mx-4 mt-5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
    >
      <div className="flex w-max min-w-full gap-1 rounded-full">
        {tabs.map((tab) => {
          const current = pathname === tab.href;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={current ? "page" : undefined}
              className={`flex h-7 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-[13px] transition-colors ${
                current
                  ? "border-accent bg-accent/15 text-text-primary"
                  : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary"
              }`}
            >
              {t(tab.label)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
