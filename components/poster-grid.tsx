import { Children } from "react";

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
