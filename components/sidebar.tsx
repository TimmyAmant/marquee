import Link from "next/link";
import { auth } from "@/auth";
import { RequestsBadge } from "@/components/requests-badge";
import { SidebarLinkShell } from "@/components/sidebar-link-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPendingRequestCount } from "@/lib/requests/query";

const NAV_ICONS = {
  discover: <circle cx="12" cy="12" r="8" />,
  movies: (
    <path
      d="M4 6h16v12H4V6ZM4 6l2.5 4M8 6l2.5 4M12 6l2.5 4M16 6l2.5 4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  series: (
    <path
      d="M4 5h16v11H4V5ZM9 20h6M4 16l3-3M20 16l-3-3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
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
    <path
      d="M9 5h6M9 12h6M9 19h6M5 5h.01M5 12h.01M5 19h.01"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
} as const;

function NavIcon({ name }: { name: keyof typeof NAV_ICONS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[17px] w-[17px] shrink-0 text-text-muted group-aria-[current=page]:text-accent">
      {NAV_ICONS[name]}
    </svg>
  );
}

function SidebarLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: keyof typeof NAV_ICONS;
  children: React.ReactNode;
}) {
  return (
    <SidebarLinkShell href={href}>
      <NavIcon name={icon} />
      {children}
    </SidebarLinkShell>
  );
}

/**
 * Persistent left nav for desktop — companion to MobileNav's drawer, which
 * already covers the same links for narrow screens (this is hidden below
 * the md breakpoint, MobileNav is hidden above it). Server component: reads
 * the session directly rather than receiving it as a prop, same as
 * SiteHeader did before this replaced its desktop nav.
 */
export async function Sidebar() {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";
  const pendingRequestCount = isAdmin ? await getPendingRequestCount().catch(() => 0) : 0;

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[230px] flex-col border-r border-border bg-bg-1/85 backdrop-blur-md md:flex">
      <Link
        href="/"
        className="flex h-[52px] shrink-0 items-center gap-2 px-[22px] font-display text-[22px] font-semibold leading-none tracking-[-0.01em] text-text-primary"
      >
        <span className="relative">
          Marquee
          <span className="absolute -right-2.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-2 pt-3">
        <SidebarLink href="/discover" icon="discover">
          Discover
        </SidebarLink>
        <SidebarLink href="/movies" icon="movies">
          Movies
        </SidebarLink>
        <SidebarLink href="/series" icon="series">
          Series
        </SidebarLink>

        {session?.user && (
          <>
            <p className="px-2.5 pb-[7px] pt-5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-text-muted">
              Library
            </p>
            <SidebarLink href="/favorites" icon="favorites">
              Favorites
            </SidebarLink>
            <SidebarLink href="/calendar" icon="calendar">
              Calendar
            </SidebarLink>
            <SidebarLink href="/requests" icon="requests">
              Requests
              {isAdmin && <RequestsBadge initialCount={pendingRequestCount} />}
            </SidebarLink>
          </>
        )}
      </nav>

      <div className="flex shrink-0 items-center gap-2.5 border-t border-border pb-3.5 pl-4 pr-3.5 pt-3.5">
        {session?.user ? (
          <Link
            href="/settings"
            className="min-w-0 flex-1 rounded-lg px-1 py-1 transition-colors hover:bg-bg-2"
          >
            <span className="block truncate text-[12.5px] font-medium leading-[15px] text-text-secondary">
              {session.user.name || session.user.username}
            </span>
            <span className="block text-[11px] leading-[14px] text-text-muted">
              {isAdmin ? "Admin" : "Member"}
            </span>
          </Link>
        ) : (
          <Link
            href="/login"
            className="min-w-0 flex-1 rounded-lg px-1 py-1 text-[12.5px] font-medium text-text-secondary transition-colors hover:bg-bg-2"
          >
            Sign in
          </Link>
        )}
        <ThemeToggle />
      </div>
    </aside>
  );
}
