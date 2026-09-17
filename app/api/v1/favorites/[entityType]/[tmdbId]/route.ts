import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { parseFavoriteParams, type FavoriteParams } from "@/lib/api/routes/favorites";
import { isFavorited } from "@/lib/favorites/query";
import { setFavoriteForUser } from "@/lib/favorites/mutate";
import type { FavoriteState } from "@/lib/api/types";

/** Whether the caller has favorited this person/company/movie/tv/collection. */
export const GET = withApi<FavoriteParams>(async (request, params): Promise<FavoriteState> => {
  const ctx = await requireApiUser(request);
  const { entityType, tmdbId } = parseFavoriteParams(params);
  return { entityType, tmdbId, favorited: await isFavorited(ctx.user.id, entityType, tmdbId) };
});

/** Favorite it (idempotent). */
export const PUT = withApi<FavoriteParams>(async (request, params): Promise<FavoriteState> => {
  const ctx = await requireApiUser(request);
  const { entityType, tmdbId } = parseFavoriteParams(params);
  return { entityType, tmdbId, favorited: await setFavoriteForUser(ctx.user.id, entityType, tmdbId, true) };
});

/** Unfavorite it (idempotent). */
export const DELETE = withApi<FavoriteParams>(async (request, params): Promise<FavoriteState> => {
  const ctx = await requireApiUser(request);
  const { entityType, tmdbId } = parseFavoriteParams(params);
  return { entityType, tmdbId, favorited: await setFavoriteForUser(ctx.user.id, entityType, tmdbId, false) };
});
