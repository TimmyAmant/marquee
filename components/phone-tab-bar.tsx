"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { NavIcon } from "@/components/nav-icons";
import { RequestsBadge } from "@/components/requests-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserAvatar } from "@/components/user-avatar";
import { useT } from "@/lib/i18n/client";
import { activePhoneTab, isUnder, moreGroupsFor, phoneTabsFor, showsPhoneTabs } from "@/lib/phone-tabs";

const MORE_SHEET_ID = "phone-more-sheet";

/**
 * The navigation on phone-sized windows (below Tailwind's md), in place of
 * the rail: a frosted pill of tabs along the bottom, like the iPhone app's
 * (lib/phone-tabs.ts has which tabs and in what order). The lit tab is in
 * the accent. More opens a sheet above the bar with the rail's other
 * sections, Settings and the help pages; any navigation closes it. The bar
 * clears the home indicator (safe-area-inset-bottom), and the page makes
 * room for it (.phone-tab-bar in app/globals.css). The notifications bell
 * stays in the header (components/site-header.tsx).
 */
export function PhoneTabBar({
  pathname,
  isSignedIn,
  showRequestsBadge,
  pendingRequestCount,
  userLabel,
  avatarSrc,
  serverLabel,
  serverVersion,
}: {
  pathname: string;
  isSignedIn: boolean;
  showRequestsBadge: boolean;
  pendingRequestCount: number;
  userLabel: string;
  avatarSrc: string | null;
  serverLabel: string | null;
  serverVersion: string;
}) {
  const t = useT();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  // Any navigation closes More (a row in it, back/forward). Same
  // render-time reset as NavMenu's search panel.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (moreOpen) setMoreOpen(false);
  }

  useEffect(() => {
    if (!moreOpen) return;
    // Opened by a tap or a key, so focus goes into the sheet.
    const target =
      sheetRef.current?.querySelector<HTMLElement>("[aria-current=page]") ??
      sheetRef.current?.querySelector<HTMLElement>("a[href]");
    target?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setMoreOpen(false);
      moreButtonRef.current?.focus();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [moreOpen]);

  if (!showsPhoneTabs(isSignedIn, pathname)) return null;

  const tabs = phoneTabsFor(isSignedIn);
  const groups = moreGroupsFor(isSignedIn);
  const active = moreOpen ? "more" : activePhoneTab(pathname);

  return (
    <>
      {/* Dims the page behind More; a tap on it closes the sheet. */}
      <div
        aria-hidden
        onClick={() => setMoreOpen(false)}
        className={`fixed inset-0 z-[52] bg-black/45 transition-opacity duration-200 md:hidden ${
          moreOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div
        id={MORE_SHEET_ID}
        ref={sheetRef}
        role="dialog"
        aria-label={t("nav.more")}
        inert={!moreOpen}
        className={`nav-glass fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[55] flex max-h-[calc(100dvh-84px-env(safe-area-inset-bottom)-72px)] origin-bottom flex-col overflow-hidden rounded-[26px] transition-[opacity,transform] duration-200 ease-out md:hidden ${
          moreOpen ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-3 scale-[0.98] opacity-0"
        }`}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-3">
          <div className="flex items-center gap-3 px-1.5 pt-1">
            <UserAvatar label={userLabel} src={avatarSrc} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-semibold leading-5 text-text-primary">{userLabel}</span>
              {serverLabel && <span className="block truncate text-[12px] leading-4 text-text-muted">{serverLabel}</span>}
            </span>
          </div>

          {groups.map((group) => (
            <ul key={group[0].href} className="overflow-hidden rounded-[18px] bg-text-primary/[0.06]">
              {group.map((item, index) => {
                const current = isUnder(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={current ? "page" : undefined}
                      className={`flex min-h-12 items-center gap-3.5 px-4 text-[16px] font-medium transition-colors active:bg-text-primary/10 ${
                        index > 0 ? "border-t border-[var(--marquee-glass-border)]" : ""
                      } ${current ? "text-accent" : "text-text-primary"}`}
                    >
                      <NavIcon name={item.icon} className="h-5 w-5 text-accent" />
                      <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>
                      <NavIcon name="chevron" className="h-4 w-4 text-text-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-[var(--marquee-glass-border)] px-5 py-2.5">
          <span className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
            <span className="relative">
              Marquee
              <span className="absolute -right-2 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
          </span>
          <span className="ml-auto text-[11px] text-text-muted">{serverVersion}</span>
          <ThemeToggle />
        </div>
      </div>

      <nav
        aria-label={t("nav.mainNav")}
        className="phone-tab-bar nav-glass fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-[55] mx-auto grid max-w-[480px] grid-cols-5 rounded-full p-1.5 md:hidden"
      >
        {tabs.map((tab) => {
          const current = active === tab.id;
          const look = `relative flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-[3px] rounded-full px-0.5 text-[10.5px] font-semibold leading-none transition-colors ${
            current ? "bg-text-primary/10 text-accent" : "text-text-secondary active:bg-text-primary/10"
          }`;
          const body = (
            <>
              <span className="relative">
                <NavIcon name={tab.icon} className="h-6 w-6" />
                {tab.id === "requests" && showRequestsBadge && (
                  <RequestsBadge
                    initialCount={pendingRequestCount}
                    className="absolute -right-3 -top-1.5 ring-2 ring-[var(--marquee-bg-1)]"
                  />
                )}
              </span>
              <span className="max-w-full truncate">{t(tab.label)}</span>
            </>
          );
          if (tab.href === null) {
            return (
              <button
                key={tab.id}
                ref={moreButtonRef}
                type="button"
                onClick={() => setMoreOpen((open) => !open)}
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                aria-controls={MORE_SHEET_ID}
                aria-current={active === "more" && !moreOpen ? "page" : undefined}
                className={look}
              >
                {body}
              </button>
            );
          }
          return (
            <Link
              key={tab.id}
              href={tab.href}
              onClick={() => setMoreOpen(false)}
              aria-current={current ? "page" : undefined}
              className={look}
            >
              {body}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
