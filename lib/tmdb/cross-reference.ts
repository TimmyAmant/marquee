import { findByTvdbId } from "@/lib/tmdb/client";

/**
 * Always resolves fresh against TMDb's own find-by-external-id endpoint
 * rather than trusting a previously-resolved mapping in our own `titles`
 * table first — a DB-cache-first version of this used to exist, but if a
 * given tvdbId was ever resolved to the wrong tmdbId (e.g. a Plex library
 * item whose folder name had the wrong release year, causing Plex's own
 * scraper to match the wrong show), that wrong mapping got returned forever
 * with no way to self-correct, even after the source data was fixed. TMDb's
 * find endpoint is already cached for an hour by the shared tmdbFetch
 * client, so there's no real cost being traded away here.
 */
export async function resolveTmdbIdFromTvdbId(tvdbId: number): Promise<number | null> {
  const result = await findByTvdbId(tvdbId).catch(() => null);
  return result?.tv_results?.[0]?.id ?? null;
}
