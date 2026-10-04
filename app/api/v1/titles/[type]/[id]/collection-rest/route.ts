import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured, unwrap } from "@/lib/api/guards";
import { ApiError, msg } from "@/lib/api/errors";
import { titleCard } from "@/lib/api/mappers";
import { parseTitleParams, requireTitle, type TitleParams } from "@/lib/api/routes/titles";
import { addCollectionRest, collectionRest } from "@/lib/collections/rest";
import type { CollectionRestResponse, CollectionRestResult } from "@/lib/api/types";

/** The rest of a movie's collection: after adding (the admin) or requesting
 * (a member) a movie, the other movies of its TMDb collection the library
 * doesn't have yet, to offer in one go. A series, or a movie in no
 * collection or with nothing left, answers `collection: null`. */
export const GET = withApi<TitleParams>(async (request, params): Promise<CollectionRestResponse> => {
  const ctx = await requireApiUser(request);
  const { mediaType, tmdbId } = parseTitleParams(params);
  await requireTmdbConfigured();
  await requireTitle(mediaType, tmdbId);
  const viewer = await ctx.viewer();
  const action = viewer.isAdmin ? "add" : "request";
  const rest = mediaType === "movie" ? await collectionRest(viewer, tmdbId) : null;
  if (!rest) return { collection: null, action, items: [] };
  return {
    collection: { id: rest.collectionId, name: rest.name },
    action: rest.action,
    items: rest.items.map((item) =>
      titleCard(item, { canQuickAdd: rest.action === "add", canRequest: rest.action === "request" }),
    ),
  };
});

/** "Add them too": the admin adds them to Radarr, a member requests them
 * (request limits and the blocklist can refuse some — still 200, `message`
 * says what happened). No body; the set is worked out again here. */
export const POST = withApi<TitleParams>(async (request, params): Promise<CollectionRestResult> => {
  const ctx = await requireApiUser(request);
  const { mediaType, tmdbId } = parseTitleParams(params);
  await requireTmdbConfigured();
  await requireTitle(mediaType, tmdbId);
  if (mediaType !== "movie") throw ApiError.of("not_found", msg("notify.notInCollection"));
  const outcome = unwrap(await addCollectionRest(await ctx.viewer(), tmdbId));
  return { ...outcome, ok: true };
});
