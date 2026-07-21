import Link from "next/link";
import { auth } from "@/auth";
import { SearchBar } from "@/components/search-bar";
import { NotificationsBell } from "@/components/notifications-bell";
import { MobileNav } from "@/components/mobile-nav";
import { getPendingRequestCount } from "@/lib/requests/query";

/**
 * Slim top bar — primary nav lives in the persistent Sidebar (desktop only,
 * see components/sidebar.tsx) so this only carries what doesn't fit there:
 * search, notifications, and the account link. Mobile still gets the brand
 * mark and hamburger here, since the sidebar is hidden below md and this is
 * the only nav surface at that width (MobileNav's own drawer covers the
 * same links the sidebar has, unchanged from before this split).
 */
export async function SiteHeader() {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";
  const pendingRequestCount = isAdmin ? await getPendingRequestCount().catch(() => 0) : 0;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg-0/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-display text-2xl tracking-tight text-text-primary md:hidden"
        >
          <span className="relative">
            Marquee
            <span className="absolute -right-2.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
        </Link>

        <div className="hidden flex-1 md:block">
          <SearchBar variant="compact" />
        </div>

        <div className="ml-auto hidden items-center gap-4 md:flex">
          {session?.user && <NotificationsBell />}
        </div>

        <div className="ml-auto flex items-center gap-3 md:hidden">
          {session?.user && <NotificationsBell />}
          <MobileNav
            isSignedIn={Boolean(session?.user)}
            isAdmin={isAdmin}
            pendingRequestCount={pendingRequestCount}
            userLabel={session?.user ? session.user.name || session.user.username || null : null}
          />
        </div>
      </div>
    </header>
  );
}
