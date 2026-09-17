import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { parseFavoriteParams, type FavoriteParams } from "@/lib/api/routes/favorites";
import { toggleFavoriteForUser } from "@/lib/favorites/mutate";
import type { FavoriteState } from "@/lib/api/types";

/** The website's star button: flips the favorite and returns the new state. */
export const POST = withApi<FavoriteParams>(async (request, params): Promise<FavoriteState> => {
  const ctx = await requireApiUser(request);
  const { entityType, tmdbId } = parseFavoriteParams(params);
  return { entityType, tmdbId, favorited: await toggleFavoriteForUser(ctx.user.id, entityType, tmdbId) };
});
