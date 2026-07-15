import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { favorites, people, companies } from "@/lib/db/schema";
import type { FavoriteEntityType } from "@/lib/db/schema";

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
  const rows = await db.select().from(people).where(inArray(people.tmdbId, ids));
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
  const rows = await db.select().from(companies).where(inArray(companies.tmdbId, ids));
  const byTmdbId = new Map(rows.map((r) => [r.tmdbId, r]));
  return ids.map((id) => byTmdbId.get(id)).filter((r) => r !== undefined);
}
