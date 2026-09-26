"use server";

import { auth } from "@/auth";
import type { FavoriteEntityType } from "@/lib/db/schema";
import { toggleFavoriteForUser } from "@/lib/favorites/mutate";
import { getT } from "@/lib/i18n/server";

export type ToggleFavoriteState = { error?: string; favorited?: boolean };

export async function toggleFavorite(
  entityType: FavoriteEntityType,
  tmdbId: number,
  _prevState: ToggleFavoriteState | undefined,
): Promise<ToggleFavoriteState> {
  const session = await auth();
  if (!session?.user) return { error: (await getT())("notify.signInToFavorite") };

  const favorited = await toggleFavoriteForUser(session.user.id, entityType, tmdbId);
  return { favorited };
}
