"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/** Shelf head geometry comes straight from the design mockup
 * (Design/Mockups/mockup.html in the MarqueeMac repo): a 28px-tall row with
 * a 20px serif title, a 20px see-all circle 9px after it, and 28px round
 * arrows pinned right, 12px above the row itself. */
export function ShelfHead({
  title,
  seeAllHref,
  flushRight,
  onScroll,
  atStart,
  atEnd,
  children,
}: {
  title: string;
  seeAllHref?: string;
  /** Shelf pages have no right page padding, so the arrows carry the 28px
   * gutter themselves. Rows that already sit inside a padded column (the
   * title page's cast carousel) pass this to align them flush instead. */
  flushRight?: boolean;
  onScroll?: (direction: 1 | -1) => void;
  atStart?: boolean;
  atEnd?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`mb-3 flex min-h-7 flex-wrap items-center gap-x-[9px] gap-y-2 ${
        flushRight ? "" : "pr-7"
      }`}
    >
      <h2 className="font-display text-[20px] font-semibold leading-none tracking-[-0.005em] text-text-primary">
        {title}
      </h2>
      {seeAllHref && (
        <Link
          href={seeAllHref}
          aria-label={`Browse all ${title}`}
          className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-secondary transition-colors hover:border-accent hover:text-accent"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[11px] w-[11px]">
            <path d="M9.5 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      )}
      {children}

      {onScroll && (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ShelfArrow direction={-1} disabled={atStart} onScroll={onScroll} />
          <ShelfArrow direction={1} disabled={atEnd} onScroll={onScroll} />
        </div>
      )}
    </div>
  );
}

function ShelfArrow({
  direction,
  disabled,
  onScroll,
}: {
  direction: 1 | -1;
  disabled?: boolean;
  onScroll: (direction: 1 | -1) => void;
}) {
  return (
    <button
      type="button"
      aria-label={direction === -1 ? "Scroll left" : "Scroll right"}
      onClick={() => onScroll(direction)}
      className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
        disabled
          ? "border-border/60 text-text-muted/60"
          : "border-border text-text-secondary hover:border-accent hover:text-accent"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
        <path
          d={direction === -1 ? "M14.5 6l-6 6 6 6" : "M9.5 6l6 6-6 6"}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/** A titled horizontally-scrolling row — the building block for every shelf
 * (posters, genre tiles, studio logos, the title page's cast carousel). Nav
 * chevrons live in the header and are always visible, not a hover-only
 * overlay on the row itself, so touch users (no hover state) can still page
 * through it. */
export function Shelf({
  title,
  seeAllHref,
  flushRight,
  gap = "poster",
  headAction,
  children,
}: {
  title: string;
  /** When provided, renders a small circular arrow next to the title linking
   * to a fuller browse page. Omitted for rows with no dedicated listing
   * (Trending, Upcoming, Studios, Networks, Recently Added). */
  seeAllHref?: string;
  flushRight?: boolean;
  /** 20px between poster cards, 16px between the wider genre tiles and the
   * cast carousel's person cards — both straight from the mockup. */
  gap?: "poster" | "tile";
  headAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ atStart: true, atEnd: false });

  const syncEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ atStart: el.scrollLeft <= 1, atEnd: max <= 1 || el.scrollLeft >= max - 1 });
  }, []);

  useEffect(() => {
    syncEdges();
  }, [syncEdges, children]);

  function scrollByAmount(direction: 1 | -1) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <section>
      <ShelfHead
        title={title}
        seeAllHref={seeAllHref}
        flushRight={flushRight}
        onScroll={scrollByAmount}
        atStart={edges.atStart}
        atEnd={edges.atEnd}
      >
        {headAction}
      </ShelfHead>

      <div
        ref={scrollRef}
        onScroll={syncEdges}
        className={`flex overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          gap === "tile" ? "gap-4" : "gap-5"
        }`}
      >
        {children}
      </div>
    </section>
  );
}
