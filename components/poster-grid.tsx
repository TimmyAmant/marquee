/** A grid of ~similarly-sized posters (roughly matching Discover's shelf
 * cards) that fills each row edge to edge — auto-fill/minmax picks however
 * many columns fit at the target width, then stretches all of them evenly
 * to use up the rest of the row, rather than a fixed-width flex-wrap that
 * left a dead gap at the end of a row whenever the container width wasn't
 * an exact multiple of the card width (most visible on mobile, where 2
 * fixed-144px cards plus a gap never quite reached the screen edge). Used
 * both for exhaustive lists (favorites, a filmography, a company catalog)
 * and for Movies/Series' infinite-scrolling results (InfiniteResultsGrid). */
export function PosterGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(136px,1fr))] gap-x-5 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(156px,1fr))]">
      {children}
    </div>
  );
}
