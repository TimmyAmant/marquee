// Pure caching-policy decisions for lib/tmdb/cache.ts, kept dependency-free
// (no DB import) so this logic — which caused two real bugs this session —
// can be unit tested directly instead of only indirectly through the
// DB-backed getOrFetchTitle.

export const TTL_MS = 14 * 24 * 60 * 60 * 1000;

// A title missing its poster/backdrop/overview gets retried far more
// aggressively than the normal TTL (see isIncomplete below), but only
// within this window — plenty of titles never get one of these fields at
// all (an old movie TMDb only ever gave a poster to, say), and retrying
// those forever on every single view would mean a live TMDb refetch plus a
// full DB write on every page load, indefinitely, for no eventual payoff.
// Past this window a still-incomplete title falls back to the normal TTL
// like anything else.
export const INCOMPLETE_RETRY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export function isStale(refreshedAt: Date): boolean {
  return Date.now() - refreshedAt.getTime() > TTL_MS;
}

/** A title first cached before TMDb had finished uploading its poster,
 * backdrop, or writing an overview (common right after a title is
 * announced, or for niche/non-English releases) would otherwise be locked
 * into showing incomplete art for the full 14-day TTL even once TMDb fills
 * it in — so treat any of the three as stale regardless of age, forcing a
 * re-check on every view until TMDb actually has the data. Backdrops in
 * particular tend to lag behind posters for very new releases. The hourly
 * Next.js fetch cache on tmdbFetch caps the real cost of the outbound
 * request at one per title per hour; INCOMPLETE_RETRY_WINDOW_MS bounds how
 * long this aggressive retry lasts before falling back to the normal TTL. */
export function isIncomplete(row: {
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
}): boolean {
  return !row.posterPath || !row.backdropPath || !row.overview;
}

/** Whether a cached title row should be served as-is (true) or re-fetched
 * from TMDb (false) — the single decision getOrFetchTitle needs to make,
 * pulled out so the "when do we trust the cache" policy itself is testable
 * without touching the database. */
export function isCacheHit(
  row: { posterPath: string | null; backdropPath: string | null; overview: string | null; refreshedAt: Date },
  hasRawTmdb: boolean,
): boolean {
  if (!hasRawTmdb) return false;
  if (isStale(row.refreshedAt)) return false;
  if (!isIncomplete(row)) return true;
  // Incomplete, but only forgive it (treat as a hit) once we're past the
  // aggressive-retry window.
  return Date.now() - row.refreshedAt.getTime() >= INCOMPLETE_RETRY_WINDOW_MS;
}
