import Link from "next/link";
import { auth } from "@/auth";
import { SearchBar } from "@/components/search-bar";
import { NotificationsBell } from "@/components/notifications-bell";

export async function SiteHeader() {
  const session = await auth();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg-0/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-display text-2xl tracking-tight text-text-primary"
        >
          <span className="relative">
            Marquee
            <span className="absolute -right-2.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
        </Link>

        <div className="hidden flex-1 sm:block">
          <SearchBar variant="compact" />
        </div>

        <nav className="ml-auto flex items-center gap-5 text-sm text-text-secondary">
          <Link href="/discover" className="transition-colors hover:text-text-primary">
            Discover
          </Link>

          {session?.user && (
            <Link href="/library" className="transition-colors hover:text-text-primary">
              My Library
            </Link>
          )}

          {session?.user && (
            <Link href="/favorites" className="transition-colors hover:text-text-primary">
              Favorites
            </Link>
          )}

          {session?.user && (
            <Link href="/calendar" className="transition-colors hover:text-text-primary">
              Calendar
            </Link>
          )}

          {session?.user && <NotificationsBell />}

          {session?.user ? (
            <Link
              href="/settings"
              className="rounded-full border border-border-strong px-4 py-1.5 text-text-primary transition-colors hover:border-accent hover:text-accent"
            >
              {session.user.name || session.user.email}
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-full border border-border-strong px-4 py-1.5 text-text-primary transition-colors hover:border-accent hover:text-accent"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
