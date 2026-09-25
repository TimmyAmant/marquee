"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RequestsBadge } from "@/components/requests-badge";
import { SearchBar } from "@/components/search-bar";
import { ThemeToggle } from "@/components/theme-toggle";

/** Fired by the header's menu button on narrow screens, where the rail is
 * hidden and the header is the only thing on screen to open the menu from. */
export const OPEN_NAV_EVENT = "marquee:open-nav";

const ICONS = {
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" strokeLinecap="round" />
    </>
  ),
  discover: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5 4.5-1.9Z" strokeLinejoin="round" />
    </>
  ),
  movies: (
    <path
      d="M4 6h16v12H4V6ZM4 6l2.5 4M8 6l2.5 4M12 6l2.5 4M16 6l2.5 4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  series: (
    <path d="M4 5h16v11H4V5ZM9 20h6M4 16l3-3M20 16l-3-3" strokeLinecap="round" strokeLinejoin="round" />
  ),
  favorites: (
    <path
      d="m12 19-7-6.1C2.5 10.5 3 6.5 6.5 5.5c2-.6 3.8.2 5.5 2.3 1.7-2.1 3.5-2.9 5.5-2.3 3.5 1 4 5 1.5 7.4L12 19Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  calendar: (
    <path
      d="M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM4 10h16M8 3v4M16 3v4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  requests: (
    <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeLinecap="round" strokeLinejoin="round" />
  ),
  menu: <path d="M5 7h14M5 12h14M5 17h14" strokeLinecap="round" />,
  chevron: <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />,
} as const;

type IconName = keyof typeof ICONS;

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden className={`shrink-0 ${className}`}>
      {ICONS[name]}
    </svg>
  );
}

type Destination = { href: string; label: string; icon: IconName };

const SEARCH: Destination = { href: "/search", label: "Search", icon: "search" };
const DISCOVER: Destination = { href: "/discover", label: "Discover", icon: "discover" };
const BROWSE: Destination[] = [
  { href: "/movies", label: "Movies", icon: "movies" },
  { href: "/series", label: "Series", icon: "series" },
];
const LIBRARY: Destination[] = [
  { href: "/favorites", label: "Favorites", icon: "favorites" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/requests", label: "Requests", icon: "requests" },
];

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/discover" && pathname === "/") return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Plex's round profile photo, with initials standing in: Marquee accounts
 * don't have pictures. */
function Avatar({ label, size }: { label: string; size: number }) {
  const initials =
    label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-bg-0 ring-2 ring-white/15"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: "linear-gradient(140deg, var(--marquee-accent-hover), var(--marquee-accent) 45%, #c2583a)",
      }}
    >
      {initials}
    </span>
  );
}

/** How long the pointer rests on the rail before it opens into the menu, so
 * sweeping past the left edge doesn't throw a panel over the page. */
const HOVER_OPEN_DELAY_MS = 220;
/** Grace period after the pointer leaves the open menu, so overshooting its
 * edge by a few pixels doesn't snap it shut. */
const HOVER_CLOSE_DELAY_MS = 260;

/**
 * The site's navigation, after the Plex app's Apple TV menu: a small
 * frosted rail floats at the left edge (profile, Search, Discover, the
 * section you're in, and a menu button), and resting on it, or pressing
 * the menu button, opens the full menu as a frosted panel over the page.
 * Below the md breakpoint the rail is hidden and the header's menu button
 * opens the same panel as a drawer.
 */
export function NavMenu({
  isSignedIn,
  isAdmin,
  pendingRequestCount,
  userLabel,
  serverLabel,
}: {
  isSignedIn: boolean;
  isAdmin: boolean;
  pendingRequestCount: number;
  userLabel: string | null;
  serverLabel: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when the menu was opened from the keyboard or a tap, which moves
  // focus into it; opening on hover leaves focus where it was.
  const focusOnOpen = useRef(false);

  // Any navigation closes the menu, however it happened (a link in the
  // menu, a search result, back/forward). Same render-time reset as
  // SearchBar uses, rather than an effect.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (open) setOpen(false);
  }

  function clearTimers() {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }

  function openMenu(moveFocus: boolean) {
    clearTimers();
    focusOnOpen.current = moveFocus;
    setOpen(true);
  }

  function closeMenu(restoreFocus = false) {
    clearTimers();
    setOpen(false);
    if (restoreFocus) menuButtonRef.current?.focus();
  }

  useEffect(() => {
    function handleOpenRequest() {
      focusOnOpen.current = true;
      setOpen(true);
    }
    window.addEventListener(OPEN_NAV_EVENT, handleOpenRequest);
    return () => window.removeEventListener(OPEN_NAV_EVENT, handleOpenRequest);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (focusOnOpen.current) {
      const target =
        panelRef.current?.querySelector<HTMLElement>("[aria-current=page]") ??
        panelRef.current?.querySelector<HTMLElement>("a[href]");
      target?.focus();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    function handlePointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (openTimer.current) clearTimeout(openTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const name = userLabel ?? "Sign in";
  const profileHref = isSignedIn ? "/settings" : "/login";
  const library = isSignedIn ? LIBRARY : [];
  // The rail keeps Plex's short list (profile, Search, Discover, menu) and
  // adds whichever other section you're in, so it always shows where you are.
  const currentExtra = [...BROWSE, ...library].find((item) => isCurrent(pathname, item.href));
  const railItems = [SEARCH, DISCOVER, ...(currentExtra ? [currentExtra] : [])];

  function badgeFor(item: Destination) {
    return item.href === "/requests" && isAdmin ? <RequestsBadge initialCount={pendingRequestCount} /> : null;
  }

  return (
    <>
      <nav
        aria-label="Main"
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse" || open) return;
          if (closeTimer.current) clearTimeout(closeTimer.current);
          openTimer.current = setTimeout(() => openMenu(false), HOVER_OPEN_DELAY_MS);
        }}
        onPointerLeave={() => {
          if (openTimer.current) clearTimeout(openTimer.current);
          openTimer.current = null;
        }}
        className={`nav-glass fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-[30px] p-[7px] transition-opacity duration-200 md:flex ${
          open ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <Link
          href={profileHref}
          aria-label={isSignedIn ? `${name}: account and settings` : "Sign in"}
          title={isSignedIn ? name : "Sign in"}
          className="mb-1 rounded-full outline-offset-2"
        >
          <Avatar label={name} size={36} />
        </Link>
        {railItems.map((item) => {
          const current = isCurrent(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={current ? "page" : undefined}
              title={item.label}
              className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                current
                  ? "bg-text-primary text-bg-0"
                  : "text-text-secondary hover:bg-text-primary/10 hover:text-text-primary"
              }`}
            >
              <Icon name={item.icon} className="h-[19px] w-[19px]" />
              {item.href === "/requests" && isAdmin && pendingRequestCount > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-bg-1" />
              )}
            </Link>
          );
        })}
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => openMenu(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="nav-menu-panel"
          title="Menu"
          className="flex h-10 w-10 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-text-primary/10 hover:text-text-primary"
        >
          <Icon name="menu" className="h-[19px] w-[19px]" />
        </button>
      </nav>

      {/* Narrow screens only: dims the page behind the drawer. */}
      <div
        aria-hidden
        onClick={() => closeMenu()}
        className={`fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div
        id="nav-menu-panel"
        ref={panelRef}
        inert={!open}
        onPointerEnter={() => {
          if (closeTimer.current) clearTimeout(closeTimer.current);
          closeTimer.current = null;
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== "mouse") return;
          closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
        }}
        className={`nav-glass fixed bottom-3 left-3 top-3 z-50 flex w-[288px] max-w-[calc(100vw-24px)] origin-left flex-col overflow-hidden rounded-[24px] transition-[opacity,transform] duration-200 ease-out ${
          open ? "translate-x-0 scale-100 opacity-100" : "pointer-events-none -translate-x-3 scale-[0.98] opacity-0"
        }`}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3 pt-4">
          <Link
            href={profileHref}
            aria-current={isCurrent(pathname, profileHref) ? "page" : undefined}
            className="group flex items-center gap-3 rounded-full py-1.5 pl-1.5 pr-3 transition-colors hover:bg-text-primary/10"
          >
            <Avatar label={name} size={38} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold leading-5 text-text-primary">{name}</span>
              {isSignedIn && serverLabel && (
                <span className="block truncate text-[11.5px] leading-4 text-text-muted">{serverLabel}</span>
              )}
            </span>
            <Icon name="chevron" className="h-4 w-4 text-text-muted transition-transform group-hover:translate-x-0.5" />
          </Link>

          {/* The header has no search box on narrow screens. */}
          <div className="mt-3 px-1 md:hidden">
            <SearchBar variant="compact" onNavigate={() => setOpen(false)} />
          </div>

          <nav aria-label="Main menu" className="mt-3 flex flex-col gap-0.5">
            {[SEARCH, DISCOVER].map((item) => (
              <MenuLink key={item.href} item={item} current={isCurrent(pathname, item.href)} prominent />
            ))}

            <SectionHeader>Browse</SectionHeader>
            {BROWSE.map((item) => (
              <MenuLink key={item.href} item={item} current={isCurrent(pathname, item.href)} />
            ))}

            {library.length > 0 && <SectionHeader>Library</SectionHeader>}
            {library.map((item) => (
              <MenuLink key={item.href} item={item} current={isCurrent(pathname, item.href)} badge={badgeFor(item)} />
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--marquee-glass-border)] px-5 py-3">
          <span className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
            <span className="relative">
              Marquee
              <span className="absolute -right-2 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
          </span>
          <ThemeToggle />
        </div>
      </div>
    </>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 pb-1.5 pt-4">
      <span className="text-[11.5px] font-semibold text-text-muted">{children}</span>
      <span aria-hidden className="h-px flex-1 bg-[var(--marquee-glass-border)]" />
    </div>
  );
}

function MenuLink({
  item,
  current,
  prominent = false,
  badge,
}: {
  item: Destination;
  current: boolean;
  prominent?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      className={`flex items-center gap-3.5 rounded-full px-3.5 transition-colors ${
        prominent ? "h-11 text-[16px] font-semibold" : "h-10 text-[15px] font-medium"
      } ${
        current
          ? "bg-text-primary text-bg-0 shadow-[0_6px_18px_rgb(0_0_0/0.25)]"
          : "text-text-primary/90 hover:bg-text-primary/10 hover:text-text-primary"
      }`}
    >
      <Icon name={item.icon} className={prominent ? "h-5 w-5" : "h-[19px] w-[19px]"} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {badge}
    </Link>
  );
}
