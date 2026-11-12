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

/** How long a title that's still changing is trusted: a show on the air (a
 * new season, its episodes, the next air date) or a movie not out yet or
 * just out (release dates, where it's streaming). */
export const ACTIVE_TTL_MS = 24 * 60 * 60 * 1000;

const RECENT_RELEASE_MS = 90 * 24 * 60 * 60 * 1000;

/** Whether TMDb's saved details describe a title that's still changing. */
export function isActiveTitle(raw: unknown, now = Date.now()): boolean {
  if (!raw || typeof raw !== "object") return false;
  const details = raw as {
    status?: string;
    next_episode_to_air?: unknown;
    in_production?: boolean;
    release_date?: string;
    last_air_date?: string;
  };
  if (details.next_episode_to_air || details.in_production) return true;
  if (details.status === "Returning Series" || details.status === "In Production" || details.status === "Planned") {
    return true;
  }
  if (details.status && details.status !== "Released" && details.status !== "Ended" && details.status !== "Canceled") {
    return true;
  }
  const latest = details.release_date || details.last_air_date;
  if (!latest) return false;
  const at = Date.parse(latest);
  return Number.isFinite(at) && now - at < RECENT_RELEASE_MS;
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
  row: {
    posterPath: string | null;
    backdropPath: string | null;
    overview: string | null;
    refreshedAt: Date;
    /** isActiveTitle of the saved details. */
    active?: boolean;
  },
  hasRawTmdb: boolean,
): boolean {
  if (!hasRawTmdb) return false;
  if (isStale(row.refreshedAt)) return false;
  // A show on the air or a movie around its release changes week to week:
  // a new season, its episodes, release dates. Re-read daily, not every two
  // weeks.
  if (row.active && Date.now() - row.refreshedAt.getTime() > ACTIVE_TTL_MS) return false;
  if (!isIncomplete(row)) return true;
  // Incomplete, but only forgive it (treat as a hit) once we're past the
  // aggressive-retry window.
  return Date.now() - row.refreshedAt.getTime() >= INCOMPLETE_RETRY_WINDOW_MS;
}
