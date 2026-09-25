"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { RequestsBadge } from "@/components/requests-badge";
import { SearchBar } from "@/components/search-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserAvatar } from "@/components/user-avatar";

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
  person: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5" strokeLinecap="round" />
    </>
  ),
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

/**
 * The site's navigation, after the Plex app's Apple TV menu. A small frosted
 * rail floats at the left edge and is the menu itself: your photo (Settings)
 * and one icon per section, each going straight there in one click, with
 * the section's name beside it on hover. The menu button at its foot opens
 * the full labeled menu as a frosted panel, only when clicked. Below the md
 * breakpoint the rail is hidden and the header's menu button opens that
 * panel as a drawer.
 */
export function NavMenu({
  isSignedIn,
  isAdmin,
  pendingRequestCount,
  userLabel,
  avatarSrc,
  serverLabel,
}: {
  isSignedIn: boolean;
  isAdmin: boolean;
  pendingRequestCount: number;
  userLabel: string | null;
  /** The signed-in account's photo URL (lib/users/avatar-path.ts), if any. */
  avatarSrc: string | null;
  serverLabel: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Any navigation closes the menu, however it happened (a link in the
  // menu, a search result, back/forward). Same render-time reset as
  // SearchBar uses, rather than an effect.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    function handleOpenRequest() {
      setOpen(true);
    }
    window.addEventListener(OPEN_NAV_EVENT, handleOpenRequest);
    return () => window.removeEventListener(OPEN_NAV_EVENT, handleOpenRequest);
  }, []);

  useEffect(() => {
    if (!open) return;
    // Opened by a click or a key, so focus goes into the menu.
    const target =
      panelRef.current?.querySelector<HTMLElement>("[aria-current=page]") ??
      panelRef.current?.querySelector<HTMLElement>("a[href]");
    target?.focus();
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

  const name = userLabel ?? "Sign in";
  const profileHref = isSignedIn ? "/settings" : "/login";
  const library = isSignedIn ? LIBRARY : [];
  // Every section is on the rail, in the menu's order: Search and Discover,
  // then Browse, then (signed in) Library, a short hairline between groups.
  const railGroups = [[SEARCH, DISCOVER], BROWSE, library].filter((group) => group.length > 0);

  function badgeFor(item: Destination) {
    return item.href === "/requests" && isAdmin ? <RequestsBadge initialCount={pendingRequestCount} /> : null;
  }

  return (
    <>
      <nav
        aria-label="Main"
        className={`nav-glass fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-[30px] p-[7px] transition-opacity duration-200 md:flex ${
          open ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <Link
          href={profileHref}
          aria-label={isSignedIn ? `${name}: account and settings` : "Sign in"}
          aria-current={isCurrent(pathname, profileHref) ? "page" : undefined}
          className="group relative mb-1 rounded-full outline-offset-2"
        >
          <ProfilePicture signedIn={isSignedIn} label={name} src={avatarSrc} size={36} />
          <RailLabel>{isSignedIn ? "Settings" : "Sign in"}</RailLabel>
        </Link>
        {railGroups.map((group, index) => (
          <Fragment key={group[0].href}>
            {index > 0 && <span aria-hidden className="my-1 h-px w-6 bg-[var(--marquee-glass-border)]" />}
            {group.map((item) => {
              const current = isCurrent(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  aria-current={current ? "page" : undefined}
                  className={`group relative flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                    current
                      ? "bg-text-primary text-bg-0"
                      : "text-text-secondary hover:bg-text-primary/10 hover:text-text-primary"
                  }`}
                >
                  <Icon name={item.icon} className="h-[19px] w-[19px]" />
                  {item.href === "/requests" && isAdmin && pendingRequestCount > 0 && (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-bg-1" />
                  )}
                  <RailLabel>{item.label}</RailLabel>
                </Link>
              );
            })}
          </Fragment>
        ))}
        <span aria-hidden className="my-1 h-px w-6 bg-[var(--marquee-glass-border)]" />
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="nav-menu-panel"
          className="group relative flex h-10 w-10 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-text-primary/10 hover:text-text-primary"
        >
          <Icon name="menu" className="h-[19px] w-[19px]" />
          <RailLabel>Menu</RailLabel>
        </button>
      </nav>

      {/* Narrow screens only: dims the page behind the drawer. */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div
        id="nav-menu-panel"
        ref={panelRef}
        inert={!open}
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
            <ProfilePicture signedIn={isSignedIn} label={name} src={avatarSrc} size={38} />
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
      <Icon name="person" className="h-1/2 w-1/2" />
    </span>
  );
}

/** The name that appears beside a rail icon on hover or keyboard focus, so
 * the icons never have to be guessed at. Decorative: the link itself
 * carries the same name as its accessible label. */
function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="nav-glass pointer-events-none absolute left-full top-1/2 ml-3 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium text-text-primary opacity-0 shadow-none transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
    >
      {children}
    </span>
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
