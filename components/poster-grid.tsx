import { Children } from "react";

/** Same fixed poster width as Discover's shelves (PosterRowItem) — a plain
 * flex-wrap of constant-size cards rather than a CSS grid whose columns
 * stretch to fill the container, so a poster looks the same size here as it
 * does in a Discover row regardless of how wide the page is.
 *
 * For an exhaustive, unpaginated list only (favorites, a filmography, a
 * company catalog) — always shows every item, so the last row can be
 * ragged. A paginated listing that wants full rows only should use
 * PaginatedPosterGrid instead, which has a "Next" page to fall back on. */
export function PosterGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-8">
      {Children.map(children, (child) => (
        <div className="w-36 shrink-0 sm:w-40">{child}</div>
      ))}
    </div>
  );
}
