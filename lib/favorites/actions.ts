"use server";

import { auth } from "@/auth";
import type { FavoriteEntityType } from "@/lib/db/schema";
import { toggleFavoriteForUser } from "@/lib/favorites/mutate";

export type ToggleFavoriteState = { error?: string; favorited?: boolean };

export async function toggleFavorite(
  entityType: FavoriteEntityType,
  tmdbId: number,
  _prevState: ToggleFavoriteState | undefined,
): Promise<ToggleFavoriteState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in to save favorites." };

  const favorited = await toggleFavoriteForUser(session.user.id, entityType, tmdbId);
  return { favorited };
}
