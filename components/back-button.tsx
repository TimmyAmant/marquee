"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/** The top-level pages the menu opens. On any of them there's nowhere to go
 * "back" to inside Marquee, so the button hides; deeper pages (a title, a
 * person, a studio, a full list) show it. */
const TOP_LEVEL = new Set(["/", "/discover", "/movies", "/series", "/search", "/favorites", "/calendar", "/requests", "/settings"]);

// Pages seen in this tab since it loaded: the fallback for browsers without
// the Navigation API. With one (a link opened straight onto a title, or the
// Home Screen app's first page) back would leave Marquee or do nothing.
let pagesSeen = 0;

/** Whether the previous history entry is a Marquee page. The Navigation API
 * only lists this site's own entries, so canGoBack is exactly that. */
function canGoBackInMarquee(): boolean {
  const nav = (window as { navigation?: { canGoBack?: boolean } }).navigation;
  return typeof nav?.canGoBack === "boolean" ? nav.canGoBack : pagesSeen > 1;
}

/**
 * The header's back button on narrow screens. A browser has its own, but an
 * iPhone Home Screen app has none (and no swipe back), so without this a
 * title → actor → another title chain can't be walked back.
 */
export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    pagesSeen += 1;
  }, [pathname]);

  if (TOP_LEVEL.has(pathname)) return null;

  return (
    <button
      type="button"
      onClick={() => (canGoBackInMarquee() ? router.back() : router.push("/discover"))}
      aria-label="Back"
      className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-secondary transition-colors hover:border-accent hover:text-accent md:hidden"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden className="h-4 w-4">
        <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
