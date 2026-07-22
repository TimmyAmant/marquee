import Link from "next/link";
import { auth } from "@/auth";
import { RequestsBadge } from "@/components/requests-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPendingRequestCount } from "@/lib/requests/query";

const NAV_ICONS = {
  home: (
    <path
      d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8.5Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  discover: <circle cx="12" cy="12" r="8" />,
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-[18px] w-[18px] shrink-0">
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
    <Link
      href={href}
      className="relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-2 hover:text-text-primary"
    >
      <NavIcon name={icon} />
      {children}
    </Link>
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
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-bg-1/60 backdrop-blur-md md:flex">
      <Link
        href="/"
        className="flex h-16 shrink-0 items-center gap-2 px-6 font-display text-2xl tracking-tight text-text-primary"
      >
        <span className="relative">
          Marquee
          <span className="absolute -right-2.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        <SidebarLink href="/" icon="home">
          Home
        </SidebarLink>
        <SidebarLink href="/discover" icon="discover">
          Discover
        </SidebarLink>

        {session?.user && (
          <>
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

      <div className="flex shrink-0 items-center gap-2 border-t border-border p-3">
        {session?.user ? (
          <Link
            href="/settings"
            className="min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg-2"
          >
            {session.user.name || session.user.username}
          </Link>
        ) : (
          <Link
            href="/login"
            className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg-2"
          >
            Sign in
          </Link>
        )}
        <ThemeToggle />
      </div>
    </aside>
  );
}
