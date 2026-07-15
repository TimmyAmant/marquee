import { Children } from "react";

/** Trims a list down to the nearest full row at the widest breakpoint (xl,
 * 6 columns), so a PosterGrid of paginated/filtered results (e.g. Discover)
 * never ends on a short row partway down the page — only ever at the very
 * end of the grid. Only use this where trimming a few trailing items is
 * harmless (more are reachable via "Next"); never on an exhaustive list like
 * My Library, where a short last row is the true, complete count and hiding
 * real items would be actively misleading. */
export function trimToFullRow<T>(items: T[], columns = 6): T[] {
  if (items.length < columns) return items;
  return items.slice(0, Math.floor(items.length / columns) * columns);
}

export function PosterGrid({ children }: { children: React.ReactNode }) {
  // Pads with one invisible filler when the count is odd, so a poster never
  // ends up alone on its own row on the 2-column (mobile) layout — never
  // drop a real item just to make the grid look tidier. This only guarantees
  // no ragged last row at the 2-column breakpoint; the grid also has 3/4/5/6
  // column breakpoints (sm/md/lg/xl below) that a single spacer can't satisfy
  // simultaneously, so a ragged last row can still appear at those wider
  // widths depending on the item count. That's an accepted tradeoff, not a
  // bug — a full fix would need per-breakpoint spacer counts or a different
  // layout technique (e.g. auto-fill + min/max width instead of fixed
  // per-breakpoint column counts).
  const isOdd = Children.count(children) % 2 === 1;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {children}
      {isOdd && <div aria-hidden className="invisible" />}
    </div>
  );
}
