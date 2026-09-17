// Pure paging math for the Movies/Series grid — dependency-free so it can be
// unit tested. Used by app/discover/fetch-items.ts.

/** TMDb never serves past page 500 of a discover query. */
export const TMDB_MAX_PAGE = 500;

/** How many TMDb pages make up one Movies/Series "page" (screenful). */
export function discoverBatchSize(hideOwned: boolean): number {
  // Several TMDb pages per screen (not just one), and a much bigger batch
  // specifically when "hide titles you already track" is on, since that
  // filter can otherwise thin a batch down to almost nothing for an account
  // with a large synced library.
  return hideOwned ? 10 : 4;
}

/** Whether another batch exists after `page`, given the largest TMDb
 * total_pages seen — the grid's infinite-scroll condition. */
export function discoverHasNextPage(page: number, maxTmdbTotalPages: number, hideOwned: boolean): boolean {
  return page * discoverBatchSize(hideOwned) < Math.min(maxTmdbTotalPages, TMDB_MAX_PAGE);
}

/** Total number of batches, consistent with discoverHasNextPage:
 * page < totalPages exactly when discoverHasNextPage(page) is true. */
export function discoverTotalPages(maxTmdbTotalPages: number, hideOwned: boolean): number {
  const cappedPages = Math.min(Math.max(1, maxTmdbTotalPages), TMDB_MAX_PAGE);
  return Math.max(1, Math.ceil(cappedPages / discoverBatchSize(hideOwned)));
}
