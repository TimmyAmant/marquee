"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { favorites } from "@/lib/db/schema";
import type { FavoriteEntityType } from "@/lib/db/schema";
import { getOrFetchTitle } from "@/lib/tmdb/cache";

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

    // Movie/TV cards can be favorited from list pages (Discover, Search)
    // that never call getOrFetchTitle themselves — make sure a local
    // `titles` row exists so the Favorites page has something to join
    // against, same as visiting the title page directly would.
    if (entityType === "movie" || entityType === "tv") {
      await getOrFetchTitle(entityType, tmdbId).catch(() => undefined);
    }
  }

  if (entityType === "person" || entityType === "company") {
    revalidatePath(`/${entityType}/${tmdbId}`);
  } else if (entityType === "movie" || entityType === "tv") {
    revalidatePath(`/title/${entityType}/${tmdbId}`);
  }
  revalidatePath("/favorites");
  return { favorited };
}
