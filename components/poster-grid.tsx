import { Children } from "react";

/** Trims a list down to a round number of items so a paginated/filtered
 * results grid (e.g. Movies/Series) doesn't end on an arbitrary count
 * partway through a visual row. Only use this where trimming a few trailing
 * items is harmless (more are reachable via "Next"); never on an exhaustive
 * list, where hiding real items would be actively misleading. */
export function trimToFullRow<T>(items: T[], columns = 8): T[] {
  if (items.length < columns) return items;
  return items.slice(0, Math.floor(items.length / columns) * columns);
}

/** Same fixed poster width as Discover's shelves (PosterRowItem) — a plain
 * flex-wrap of constant-size cards rather than a CSS grid whose columns
 * stretch to fill the container, so a poster looks the same size here as it
 * does in a Discover row regardless of how wide the page is. */
export function PosterGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-8">
      {Children.map(children, (child) => (
        <div className="w-36 shrink-0 sm:w-40">{child}</div>
      ))}
    </div>
  );
}
