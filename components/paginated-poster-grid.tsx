"use client";

import { Children, useEffect, useRef, useState } from "react";

const ROWS = 5;
const GAP_PX = 16; // matches gap-x-4
const CARD_WIDTH_BASE = 144; // matches w-36
const CARD_WIDTH_SM = 160; // matches sm:w-40
const SM_BREAKPOINT_PX = 640;

/**
 * Like PosterGrid, but for a paginated listing (Discover/Movies/Series) that
 * has a "Next" page to reach more results — measures the container's actual
 * rendered width to work out how many fixed-width cards fit per row, then
 * clips down to exactly `ROWS` full rows, so the grid never ends on a
 * ragged partial row no matter how wide the page is. Nothing is lost: the
 * hidden remainder of this batch is simply not shown, the same way it
 * always was cheaper to over-fetch than to under-fetch for "Next".
 *
 * Never use this for an exhaustive, unpaginated list (favorites, a
 * filmography, a company catalog) — there's no "Next" there, so hiding
 * items past the last full row would make real content permanently
 * unreachable. Use PosterGrid for those instead.
 */
export function PaginatedPosterGrid({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // null until the first client-side measurement — renders everything for
  // that one frame (unavoidable without knowing the viewport at SSR time),
  // then settles to a row-aligned count.
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  const items = Children.toArray(children);
  const itemCount = items.length;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function recompute() {
      const width = el!.clientWidth;
      const cardWidth = window.innerWidth >= SM_BREAKPOINT_PX ? CARD_WIDTH_SM : CARD_WIDTH_BASE;
      const columns = Math.max(1, Math.floor((width + GAP_PX) / (cardWidth + GAP_PX)));
      // Never show a ragged row — if there aren't enough items for ROWS full
      // rows at this width (a heavily-filtered page, or a very wide one),
      // show as many full rows as the batch actually has instead. The one
      // exception is a batch smaller than a single row: there's no full row
      // to fall back to, so show it as-is rather than hiding every result.
      const fullRowsAvailable = Math.floor(itemCount / columns) * columns;
      setVisibleCount(fullRowsAvailable > 0 ? Math.min(columns * ROWS, fullRowsAvailable) : itemCount);
    }

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [itemCount]);

  const visibleItems = visibleCount !== null ? items.slice(0, visibleCount) : items;

  return (
    <div ref={containerRef} className="flex flex-wrap gap-x-4 gap-y-8">
      {visibleItems.map((child, i) => (
        <div key={i} className="w-36 shrink-0 sm:w-40">
          {child}
        </div>
      ))}
    </div>
  );
}
