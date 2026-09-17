import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { favorites } from "@/lib/db/schema";
import type { FavoriteEntityType } from "@/lib/db/schema";
import { getOrFetchTitle, getOrFetchPersonWithCredits, getOrFetchCompanyWithCatalog } from "@/lib/tmdb/cache";

// Shared by the favorite star's server action (lib/favorites/actions.ts) and
// /api/v1/favorites.

function favoriteWhere(userId: string, entityType: FavoriteEntityType, tmdbId: number) {
  return and(eq(favorites.userId, userId), eq(favorites.entityType, entityType), eq(favorites.tmdbId, tmdbId));
}

/** Cards can be favorited from places (Cast/Studio rows, Discover, Search)
 * that never visit the entity's own page — make sure a local cache row exists
 * so the Favorites page has something to join against, same as visiting the
 * entity's own page directly would. */
async function warmFavoriteCache(entityType: FavoriteEntityType, tmdbId: number) {
  if (entityType === "movie" || entityType === "tv") {
    await getOrFetchTitle(entityType, tmdbId).catch(() => undefined);
  } else if (entityType === "person") {
    await getOrFetchPersonWithCredits(tmdbId).catch(() => undefined);
  } else if (entityType === "company") {
    await getOrFetchCompanyWithCatalog(tmdbId).catch(() => undefined);
  }
}

function revalidateFavoritePaths(entityType: FavoriteEntityType, tmdbId: number) {
  if (entityType === "person" || entityType === "company") {
    revalidatePath(`/${entityType}/${tmdbId}`);
  } else if (entityType === "movie" || entityType === "tv") {
    revalidatePath(`/title/${entityType}/${tmdbId}`);
  } else if (entityType === "collection") {
    // A collection's favorite button can appear on any movie in that
    // franchise's title page — there's no single dynamic segment to target,
    // so revalidate every page matching the route pattern instead.
    revalidatePath("/title/[type]/[id]", "page");
  }
  revalidatePath("/favorites");
}

/** Flips a favorite and returns the new state. */
export async function toggleFavoriteForUser(
  userId: string,
  entityType: FavoriteEntityType,
  tmdbId: number,
): Promise<boolean> {
  // Delete-first, single write: avoids a separate existence-check query
  // racing with a concurrent toggle (double-click, two tabs) — the DB's
  // row count, not a stale read, decides which branch we took.
  const deleted = await db
    .delete(favorites)
    .where(favoriteWhere(userId, entityType, tmdbId))
    .returning({ id: favorites.id });
  const favorited = deleted.length === 0;
  if (favorited) {
    await db.insert(favorites).values({ userId, entityType, tmdbId }).onConflictDoNothing();
    await warmFavoriteCache(entityType, tmdbId);
  }

  revalidateFavoritePaths(entityType, tmdbId);
  return favorited;
}

/** Idempotent set/unset — for clients that know the state they want rather
 * than wanting a toggle (retries can't flip it back). */
export async function setFavoriteForUser(
  userId: string,
  entityType: FavoriteEntityType,
  tmdbId: number,
  favorited: boolean,
): Promise<boolean> {
  if (favorited) {
    await db.insert(favorites).values({ userId, entityType, tmdbId }).onConflictDoNothing();
    await warmFavoriteCache(entityType, tmdbId);
  } else {
    await db.delete(favorites).where(favoriteWhere(userId, entityType, tmdbId));
  }

  revalidateFavoritePaths(entityType, tmdbId);
  return favorited;
}
