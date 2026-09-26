import Link from "next/link";
import { auth } from "@/auth";
import { NotificationsBell } from "@/components/notifications-bell";
import { NavMenuButton } from "@/components/nav-menu-button";

/**
 * Slim top bar: the wordmark. Navigation, search and notifications are on
 * the floating rail (components/nav-menu.tsx); below md the rail is hidden,
 * so here the bell and the menu button (which opens the same menu as a
 * drawer, with search) stand in for it.
 */
export async function SiteHeader() {
  const session = await auth();

  return (
    <header className="sticky top-0 z-30">
      {/* The mockup's .tb-blur: taller than the 52px bar and masked away by
          62% of its height, so there's no hard edge where it ends — a title
          page's backdrop keeps running underneath it. It reaches back over
          the nav rail's margin to the window edge, like the backdrop. With
          the rail as a bar along the top, the header grows to hold it
          beside the wordmark. */}
      <div
        aria-hidden
        className="rail-under pointer-events-none absolute inset-x-0 top-0 h-[70px] backdrop-blur-[16px] backdrop-saturate-[1.15] md:rail-top:h-[90px] [mask-image:linear-gradient(#000_62%,transparent)]"
        style={{
          background:
            "linear-gradient(color-mix(in srgb, var(--marquee-bg-0) 78%, transparent), color-mix(in srgb, var(--marquee-bg-0) 50%, transparent) 72%, transparent)",
        }}
      />
      <div className="relative flex h-[52px] items-center gap-4 px-4 sm:pl-[22px] sm:pr-4 md:rail-top:h-[72px]">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-display text-[22px] font-semibold leading-none tracking-[-0.01em] text-text-primary"
        >
          <span className="relative">
            Marquee
            <span className="absolute -right-2.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3 md:hidden">
          {session?.user && <NotificationsBell />}
          <NavMenuButton />
        </div>
      </div>
    </header>
  );
}
