"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { favorites } from "@/lib/db/schema";
import type { FavoriteEntityType } from "@/lib/db/schema";
import { getOrFetchTitle, getOrFetchPersonWithCredits, getOrFetchCompanyWithCatalog } from "@/lib/tmdb/cache";

export type ToggleFavoriteState = { error?: string; favorited?: boolean };

export async function toggleFavorite(
  entityType: FavoriteEntityType,
  tmdbId: number,
  _prevState: ToggleFavoriteState | undefined,
): Promise<ToggleFavoriteState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in to save favorites." };

  const userId = session.user.id;
  const where = and(
    eq(favorites.userId, userId),
    eq(favorites.entityType, entityType),
    eq(favorites.tmdbId, tmdbId),
  );

  // Delete-first, single write: avoids a separate existence-check query
  // racing with a concurrent toggle (double-click, two tabs) — the DB's
  // row count, not a stale read, decides which branch we took.
  const deleted = await db.delete(favorites).where(where).returning({ id: favorites.id });
  const favorited = deleted.length === 0;
  if (favorited) {
    await db.insert(favorites).values({ userId, entityType, tmdbId }).onConflictDoNothing();

    // Cards can be favorited from places (Cast/Studio rows, Discover,
    // Search) that never visit the entity's own page — make sure a local
    // cache row exists so the Favorites page has something to join
    // against, same as visiting the entity's own page directly would.
    if (entityType === "movie" || entityType === "tv") {
      await getOrFetchTitle(entityType, tmdbId).catch(() => undefined);
    } else if (entityType === "person") {
      await getOrFetchPersonWithCredits(tmdbId).catch(() => undefined);
    } else if (entityType === "company") {
      await getOrFetchCompanyWithCatalog(tmdbId).catch(() => undefined);
    }
  }

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
  return { favorited };
}
