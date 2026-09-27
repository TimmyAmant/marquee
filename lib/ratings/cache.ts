import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { titleRatings, type MediaType } from "@/lib/db/schema";
import { getOmdbApiKey } from "@/lib/integrations/app-settings";
import { EMPTY_RATINGS, fetchOmdbRatings, type TitleRatings } from "@/lib/ratings/omdb";

/** How long a title's OMDb answer is kept before it's asked again. */
export const RATINGS_TTL_MS = 24 * 60 * 60 * 1000;

export function isRatingsFresh(fetchedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - fetchedAt.getTime() < RATINGS_TTL_MS;
}

type Row = typeof titleRatings.$inferSelect;

export function ratingsFromRow(row: Row): TitleRatings {
  return {
    imdbRating: row.imdbRatingTenths === null ? null : row.imdbRatingTenths / 10,
    imdbVotes: row.imdbVotes,
    rottenTomatoesCritics: row.rottenTomatoesCritics,
    metacritic: row.metacritic,
  };
}

function rowFromRatings(ratings: TitleRatings) {
  return {
    imdbRatingTenths: ratings.imdbRating === null ? null : Math.round(ratings.imdbRating * 10),
    imdbVotes: ratings.imdbVotes,
    rottenTomatoesCritics: ratings.rottenTomatoesCritics,
    metacritic: ratings.metacritic,
  };
}

/**
 * The title's OMDb ratings: from title_ratings when fetched within a day,
 * else from OMDb (and remembered). Null when OMDb isn't set up, the title
 * has no IMDb id, or OMDb couldn't be reached and nothing was remembered —
 * the page just shows TMDb's score then. A `fetch` can be passed in by
 * tests; the default asks OMDb with the saved key.
 */
export async function getTitleRatings(
  mediaType: MediaType,
  tmdbId: number,
  imdbId: string | null,
  options: { now?: Date; fetch?: (apiKey: string, imdbId: string) => Promise<TitleRatings> } = {},
): Promise<TitleRatings | null> {
  const apiKey = await getOmdbApiKey();
  if (!apiKey || !imdbId) return null;
  const now = options.now ?? new Date();
  const fetchRatings = options.fetch ?? fetchOmdbRatings;

  const [row] = await db
    .select()
    .from(titleRatings)
    .where(and(eq(titleRatings.mediaType, mediaType), eq(titleRatings.tmdbId, tmdbId)))
    .limit(1);
  // A relinked title (new IMDb id) is asked again even inside the day.
  if (row && row.imdbId === imdbId && isRatingsFresh(row.fetchedAt, now)) return ratingsFromRow(row);

  let ratings: TitleRatings;
  try {
    ratings = await fetchRatings(apiKey, imdbId);
  } catch (err) {
    console.error(`[ratings] OMDb lookup failed for ${imdbId}:`, err);
    // Stale is better than nothing for a day-old answer; nothing otherwise.
    return row && row.imdbId === imdbId ? ratingsFromRow(row) : null;
  }

  await db
    .insert(titleRatings)
    .values({ mediaType, tmdbId, imdbId, ...rowFromRatings(ratings), fetchedAt: now })
    .onConflictDoUpdate({
      target: [titleRatings.mediaType, titleRatings.tmdbId],
      set: { imdbId, ...rowFromRatings(ratings), fetchedAt: now },
    });
  return ratings ?? EMPTY_RATINGS;
}
