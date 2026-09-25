import Link from "next/link";
import { auth } from "@/auth";
import { SearchBar } from "@/components/search-bar";
import { NotificationsBell } from "@/components/notifications-bell";
import { NavMenuButton } from "@/components/nav-menu-button";

/**
 * Slim top bar: the wordmark, search and notifications. Navigation itself
 * is the floating rail and its menu (components/nav-menu.tsx); below md the
 * rail is hidden, so the menu button here opens the same menu as a drawer.
 */
export async function SiteHeader() {
  const session = await auth();

  return (
    <header className="sticky top-0 z-30">
      {/* The mockup's .tb-blur: taller than the 52px bar and masked away by
          62% of its height, so there's no hard edge where it ends — a title
          page's backdrop keeps running underneath it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[70px] backdrop-blur-[16px] backdrop-saturate-[1.15] [mask-image:linear-gradient(#000_62%,transparent)]"
        style={{
          background:
            "linear-gradient(color-mix(in srgb, var(--marquee-bg-0) 78%, transparent), color-mix(in srgb, var(--marquee-bg-0) 50%, transparent) 72%, transparent)",
        }}
      />
      <div className="relative flex h-[52px] items-center gap-4 px-4 sm:pl-[22px] sm:pr-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-display text-[22px] font-semibold leading-none tracking-[-0.01em] text-text-primary"
        >
          <span className="relative">
            Marquee
            <span className="absolute -right-2.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
        </Link>

        <div className="ml-auto hidden w-[300px] shrink-0 md:block">
          <SearchBar variant="compact" />
        </div>

        <div className="hidden items-center gap-2.5 md:flex">
          {session?.user && <NotificationsBell />}
        </div>

        <div className="ml-auto flex items-center gap-3 md:hidden">
          {session?.user && <NotificationsBell />}
          <NavMenuButton />
        </div>
      </div>
    </header>
  );
}
