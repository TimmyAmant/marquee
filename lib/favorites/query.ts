import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { favorites, people, companies, titles } from "@/lib/db/schema";
import type { FavoriteEntityType, MediaType } from "@/lib/db/schema";
import { getOrFetchCompanyWithCatalog, getOrFetchPersonWithCredits, getOrFetchTitle } from "@/lib/tmdb/cache";

/** Favorites fetched again per page load when they have no saved details
 * (TMDb was unreachable when they were favorited): a bound, so a long
 * outage can't make the page slow. */
const MISSING_FETCHED_PER_LOAD = 10;

/** The ids a lookup didn't find, tried against TMDb (a few per load), so a
 * favorite saved while TMDb was down shows up instead of vanishing. */
async function fetchMissing(ids: number[], found: Set<number>, fetch: (id: number) => Promise<unknown>) {
  const missing = ids.filter((id) => !found.has(id)).slice(0, MISSING_FETCHED_PER_LOAD);
  await Promise.all(missing.map((id) => fetch(id).catch(() => undefined)));
  return missing.length > 0;
}

export async function isFavorited(
  userId: string,
  entityType: FavoriteEntityType,
  tmdbId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.entityType, entityType), eq(favorites.tmdbId, tmdbId)))
    .limit(1);
  return Boolean(row);
}

/** Membership check for a whole list of ids at once — for rendering a
 * favorite star's initial state across a grid of cards without one query
 * per card. */
export async function getFavoritedTmdbIds(
  userId: string,
  entityType: FavoriteEntityType,
  tmdbIds: number[],
): Promise<Set<number>> {
  if (tmdbIds.length === 0) return new Set();
  const rows = await db
    .select({ tmdbId: favorites.tmdbId })
    .from(favorites)
    .where(
      and(
        eq(favorites.userId, userId),
        eq(favorites.entityType, entityType),
        inArray(favorites.tmdbId, tmdbIds),
      ),
    );
  return new Set(rows.map((r) => r.tmdbId));
}

export async function getFavorites(userId: string, entityType: FavoriteEntityType) {
  return db
    .select()
    .from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.entityType, entityType)))
    .orderBy(desc(favorites.createdAt));
}

export async function getFavoritePeople(userId: string) {
  const favs = await getFavorites(userId, "person");
  const ids = favs.map((f) => f.tmdbId);
  if (ids.length === 0) return [];
  let rows = await db.select().from(people).where(inArray(people.tmdbId, ids));
  if (await fetchMissing(ids, new Set(rows.map((r) => r.tmdbId)), getOrFetchPersonWithCredits)) {
    rows = await db.select().from(people).where(inArray(people.tmdbId, ids));
  }
  // `inArray` doesn't preserve `ids`' order, so re-sort by the favorites'
  // most-recently-favorited-first order rather than whatever order Postgres
  // happens to return the joined rows in.
  const byTmdbId = new Map(rows.map((r) => [r.tmdbId, r]));
  return ids.map((id) => byTmdbId.get(id)).filter((r) => r !== undefined);
}

export async function getFavoriteCompanies(userId: string) {
  const favs = await getFavorites(userId, "company");
  const ids = favs.map((f) => f.tmdbId);
  if (ids.length === 0) return [];
  let rows = await db.select().from(companies).where(inArray(companies.tmdbId, ids));
  if (await fetchMissing(ids, new Set(rows.map((r) => r.tmdbId)), getOrFetchCompanyWithCatalog)) {
    rows = await db.select().from(companies).where(inArray(companies.tmdbId, ids));
  }
  const byTmdbId = new Map(rows.map((r) => [r.tmdbId, r]));
  return ids.map((id) => byTmdbId.get(id)).filter((r) => r !== undefined);
}

/** Movies and TV favorites share the `titles` cache table, keyed by
 * (mediaType, tmdbId) rather than tmdbId alone — unlike people/companies,
 * ids can collide across the two media types, so each is looked up and
 * re-merged separately before restoring the original favorited-first order. */
export async function getFavoriteTitles(userId: string, mediaType: MediaType) {
  const favs = await getFavorites(userId, mediaType);
  const ids = favs.map((f) => f.tmdbId);
  if (ids.length === 0) return [];
  const read = () =>
    db
      .select()
      .from(titles)
      .where(and(eq(titles.mediaType, mediaType), inArray(titles.tmdbId, ids)));
  let rows = await read();
  if (await fetchMissing(ids, new Set(rows.map((r) => r.tmdbId)), (id) => getOrFetchTitle(mediaType, id))) {
    rows = await read();
  }
  const byTmdbId = new Map(rows.map((r) => [r.tmdbId, r]));
  return ids.map((id) => byTmdbId.get(id)).filter((r) => r !== undefined);
}

/** Collections have no local cache table (unlike titles/people/companies) —
 * callers fetch each one live from TMDb by id, this just returns which ids
 * are favorited and in what order. */
export async function getFavoriteCollectionIds(userId: string): Promise<number[]> {
  const favs = await getFavorites(userId, "collection");
  return favs.map((f) => f.tmdbId);
}
