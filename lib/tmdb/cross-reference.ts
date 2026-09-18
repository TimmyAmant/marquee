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
  return (await lookupTmdbIdFromTvdbId(tvdbId)).tmdbId;
}

/** Same lookup, but tells "TMDb has no match for this show" apart from "the
 * lookup itself failed" — callers that delete rows for anything they didn't
 * see need the difference: a show TMDb simply doesn't know is safe to leave
 * out, while a failed lookup means the picture is incomplete. */
export async function lookupTmdbIdFromTvdbId(
  tvdbId: number,
): Promise<{ tmdbId: number | null; failed: boolean }> {
  try {
    const result = await findByTvdbId(tvdbId);
    return { tmdbId: result?.tv_results?.[0]?.id ?? null, failed: false };
  } catch {
    return { tmdbId: null, failed: true };
  }
}
