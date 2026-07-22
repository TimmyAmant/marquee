"use client";

import { useRef } from "react";
import Link from "next/link";

/** A titled horizontally-scrolling row — Discover's building block for every
 * section (posters, genre tiles, studio logos). Nav chevrons live in the
 * header and are always visible, not a hover-only overlay on the row itself,
 * so touch users (no hover state) can still page through it. */
export function Shelf({
  title,
  seeAllHref,
  children,
}: {
  title: string;
  /** When provided, renders a small circular arrow next to the title linking
   * to a fuller browse page. Omitted for rows with no dedicated listing
   * (Trending, Upcoming, Studios, Networks, Recently Added). */
  seeAllHref?: string;
  children: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollByAmount(direction: 1 | -1) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl text-text-primary">{title}</h2>
          {seeAllHref && (
            <Link
              href={seeAllHref}
              aria-label={`Browse all ${title}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-secondary transition-colors hover:border-accent hover:text-accent"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scrollByAmount(-1)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border-strong text-text-secondary transition-colors hover:border-accent hover:text-accent"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scrollByAmount(1)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border-strong text-text-secondary transition-colors hover:border-accent hover:text-accent"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </section>
  );
}
