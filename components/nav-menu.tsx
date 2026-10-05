"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { NavIcon, type NavIconName } from "@/components/nav-icons";
import { NotificationsBell } from "@/components/notifications-bell";
import { PhoneTabBar } from "@/components/phone-tab-bar";
import { SearchBar } from "@/components/search-bar";
import { UserAvatar } from "@/components/user-avatar";
import { useT } from "@/lib/i18n/client";
import { RAIL_LABELED_ITEM } from "@/lib/rail-position";
import type { MessageKey } from "@/lib/i18n/translator";

type Destination = { href: string; label: MessageKey; icon: NavIconName };

const SEARCH: Destination = { href: "/search", label: "common.search", icon: "search" };
const DISCOVER: Destination = { href: "/discover", label: "nav.discover", icon: "discover" };
const BROWSE: Destination[] = [
  { href: "/movies", label: "common.movies", icon: "movies" },
  { href: "/series", label: "common.series", icon: "series" },
];
const LIBRARY: Destination[] = [
  { href: "/library", label: "nav.library", icon: "library" },
  { href: "/favorites", label: "nav.favorites", icon: "favorites" },
  { href: "/calendar", label: "nav.calendar", icon: "calendar" },
  { href: "/requests", label: "nav.requests", icon: "requests" },
];

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/discover" && pathname === "/") return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The site's navigation, after the Plex app's Apple TV menu. A small frosted
 * rail floats at the left edge and is the whole menu: your photo (Settings),
 * notifications, and one icon per section, each going straight there in one
 * click, with the section's name beside it on hover. Settings › Account ›
 * Appearance can move it to the right edge or lay it out as a bar along the
 * top or bottom (lib/rail-position.ts; the layout switches in CSS off
 * data-rail on <html>). Search opens as a floating panel over the page.
 * Below the md breakpoint, where there's no room for the rail, a tab bar
 * along the bottom takes its place, like the iPhone app's, wherever the
 * rail is set to go (components/phone-tab-bar.tsx).
 */
export function NavMenu({
  isSignedIn,
  userId,
  showRequestsBadge,
  pendingRequestCount,
  userLabel,
  avatarSrc,
  serverLabel,
  serverVersion,
}: {
  isSignedIn: boolean;
  /** The signed-in account, whose recent searches the search panel shows. */
  userId: string | null;
  /** Whoever reviews requests or handles problem reports. */
  showRequestsBadge: boolean;
  pendingRequestCount: number;
  userLabel: string | null;
  /** The signed-in account's photo URL (lib/users/avatar-path.ts), if any. */
  avatarSrc: string | null;
  serverLabel: string | null;
  /** This server's Marquee version, at the end of the labeled rail and in
   * the phone's More sheet ("Show menu labels", lib/rail-position.ts). */
  serverVersion: string;
}) {
  const t = useT();
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const searchButtonRef = useRef<HTMLButtonElement>(null);

  // Any navigation closes the search panel, however it happened (a search
  // result, back/forward). Same render-time reset as SearchBar uses, rather
  // than an effect.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (searchOpen) setSearchOpen(false);
  }

  const name = userLabel ?? t("nav.signIn");
  const profileHref = isSignedIn ? "/settings" : "/login";
  const library = isSignedIn ? LIBRARY : [];
  // Every section is on the rail, in the menu's order: Search and Discover,
  // then Browse, then (signed in) Library, a short hairline between groups.
  const railGroups = [[SEARCH, DISCOVER], BROWSE, library].filter((group) => group.length > 0);

  return (
    <>
      <nav
        aria-label={t("nav.mainNav")}
        className="nav-glass fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-[30px] p-[7px] md:flex lg:rail-labeled:w-[208px] lg:rail-labeled:items-stretch lg:rail-labeled:rounded-[24px] lg:rail-labeled:p-2 rail-right:left-auto rail-right:right-4 rail-bar:left-1/2 rail-bar:-translate-x-1/2 rail-bar:translate-y-0 rail-bar:flex-row rail-top:top-3 rail-bottom:top-auto rail-bottom:bottom-[calc(12px+env(safe-area-inset-bottom))]"
      >
        <Link
          href={profileHref}
          aria-label={isSignedIn ? t("nav.accountAndSettings", { name }) : t("nav.signIn")}
          aria-current={isCurrent(pathname, profileHref) ? "page" : undefined}
          className="group relative mb-1 rounded-full outline-offset-2 rail-bar:mb-0 rail-bar:mr-1 lg:rail-labeled:flex lg:rail-labeled:items-center lg:rail-labeled:gap-2.5 lg:rail-labeled:py-0.5 lg:rail-labeled:pl-0.5 lg:rail-labeled:pr-2 lg:rail-labeled:hover:bg-text-primary/10"
        >
          <ProfilePicture signedIn={isSignedIn} label={name} src={avatarSrc} size={36} />
          <InlineLabel className="font-semibold">{name}</InlineLabel>
          <RailLabel>{isSignedIn ? t("nav.settings") : t("nav.signIn")}</RailLabel>
        </Link>
        {isSignedIn && (
          <>
            <NotificationsBell
              variant="rail"
              railLabel={<RailLabel>{t("nav.notifications")}</RailLabel>}
              inlineLabel={<InlineLabel>{t("nav.notifications")}</InlineLabel>}
            />
            <RailDivider />
          </>
        )}
        {railGroups.map((group, index) => (
          <Fragment key={group[0].href}>
            {index > 0 && <RailDivider />}
            {group.map((item) => {
              const current = isCurrent(pathname, item.href);
              if (item === SEARCH) {
                return (
                  <button
                    key={item.href}
                    ref={searchButtonRef}
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    aria-label={t(item.label)}
                    aria-haspopup="dialog"
                    className={`group relative flex h-10 w-10 items-center justify-center rounded-full transition-colors ${RAIL_LABELED_ITEM} ${
                      current || searchOpen
                        ? "bg-text-primary text-bg-0"
                        : "text-text-secondary hover:bg-text-primary/10 hover:text-text-primary"
                    }`}
                  >
                    <NavIcon name={item.icon} className="h-[19px] w-[19px]" />
                    <InlineLabel>{t(item.label)}</InlineLabel>
                    <RailLabel>{t(item.label)}</RailLabel>
                  </button>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={t(item.label)}
                  aria-current={current ? "page" : undefined}
                  className={`group relative flex h-10 w-10 items-center justify-center rounded-full transition-colors ${RAIL_LABELED_ITEM} ${
                    current
                      ? "bg-text-primary text-bg-0"
                      : "text-text-secondary hover:bg-text-primary/10 hover:text-text-primary"
                  }`}
                >
                  <NavIcon name={item.icon} className="h-[19px] w-[19px]" />
                  <InlineLabel>{t(item.label)}</InlineLabel>
                  {item.href === "/requests" && showRequestsBadge && pendingRequestCount > 0 && (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-bg-1" />
                  )}
                  <RailLabel>{t(item.label)}</RailLabel>
                </Link>
              );
            })}
          </Fragment>
        ))}
        <p className="hidden border-t border-[var(--marquee-glass-border)] px-3 pb-1 pt-2.5 text-[11px] text-text-muted lg:rail-labeled:block">
          {t("nav.serverVersion", { version: serverVersion })}
        </p>
      </nav>

      {searchOpen && (
        <SearchDialog
          userId={userId}
          onNavigate={() => setSearchOpen(false)}
          onDismiss={() => {
            setSearchOpen(false);
            searchButtonRef.current?.focus();
          }}
        />
      )}

      <PhoneTabBar
        pathname={pathname}
        isSignedIn={isSignedIn}
        showRequestsBadge={showRequestsBadge}
        pendingRequestCount={pendingRequestCount}
        userLabel={name}
        avatarSrc={avatarSrc}
        serverLabel={serverLabel}
        serverVersion={serverVersion}
      />
    </>
  );
}

/**
 * components/search-bar.tsx as a floating panel over the page, from the
 * rail's Search: type-ahead suggestions, Enter for the results page, Escape
 * (once the suggestions are closed) or a click outside to dismiss, which
 * hands focus back to the rail's Search. Tab stays inside it. Navigating
 * closes it too (NavMenu resets it on every route change).
 */
function SearchDialog({
  userId,
  onNavigate,
  onDismiss,
}: {
  userId: string | null;
  onNavigate: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // The search box's suggestions or recent searches closing first.
        if (!e.defaultPrevented) onDismiss();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>("input, button, [href], [tabindex]:not([tabindex='-1'])"),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss]);

  return (
    <div role="dialog" aria-modal="true" aria-label={t("common.search")} className="fixed inset-0 z-50 hidden md:block">
      <div aria-hidden onClick={onDismiss} className="absolute inset-0 bg-black/30" />
      <div
        ref={panelRef}
        className="nav-glass relative mx-auto mt-[90px] w-[560px] max-w-[calc(100vw-120px)] rounded-[20px] p-2.5 shadow-[0_24px_60px_rgb(0_0_0/0.35)]"
      >
        <SearchBar autoFocus onNavigate={onNavigate} userId={userId} />
      </div>
    </div>
  );
}

/** Your photo or initials when signed in; a plain person when not, rather
 * than the initials of "Sign in". */
function ProfilePicture({ signedIn, label, src, size }: { signedIn: boolean; label: string; src: string | null; size: number }) {
  if (signedIn) return <UserAvatar label={label} src={src} size={size} />;
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-text-primary/10 text-text-secondary"
      style={{ width: size, height: size }}
    >
      <NavIcon name="person" className="h-1/2 w-1/2" />
    </span>
  );
}

/** The section's name beside a rail icon, shown only on the labeled rail
 * (the icon-only rail names it on hover, RailLabel). Decorative: the item
 * carries the same name as its accessible label. */
function InlineLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span aria-hidden className={`hidden min-w-0 truncate text-[14px] font-medium lg:rail-labeled:block ${className}`}>
      {children}
    </span>
  );
}

/** The hairline between groups of rail items: across a vertical rail,
 * upright in a horizontal bar. */
function RailDivider() {
  return (
    <span
      aria-hidden
      className="my-1 h-px w-6 shrink-0 bg-[var(--marquee-glass-border)] rail-bar:mx-1 rail-bar:my-0 rail-bar:h-6 rail-bar:w-px lg:rail-labeled:w-full"
    />
  );
}

/** The name that appears beside a rail icon on hover or keyboard focus, so
 * the icons never have to be guessed at: on the content side of the rail,
 * wherever it sits (.rail-label in app/globals.css). Decorative: the link
 * itself carries the same name as its accessible label. */
function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="rail-label nav-glass pointer-events-none absolute whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium text-text-primary opacity-0 shadow-none transition-[opacity,translate] duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  );
}
