import { withApi } from "@/lib/api/handler";
import { msg } from "@/lib/api/errors";
import { requireApiAdmin } from "@/lib/api/auth";
import { requireTmdbConfigured, unwrap } from "@/lib/api/guards";
import { optionalBoolean, readJsonBody } from "@/lib/api/request";
import { parseTitleParams, requireTitle, type TitleParams } from "@/lib/api/routes/titles";
import { removeTitleFromArr, type RemoveResult } from "@/lib/arr/remove";

/** Admin "Remove from Radarr/Sonarr" (never an API key): takes the title off
 * every standard server that has it, or with `is4k` the 4K ones, and its
 * files too with `deleteFiles`. The approved requests for it are marked
 * removed, so it can be asked for again. Body: { "deleteFiles": bool,
 * "is4k"?: bool }. */
export const POST = withApi<TitleParams>(async (request, params): Promise<{ ok: true } & RemoveResult> => {
  const ctx = await requireApiAdmin(request, msg("server.onlyAdminRemoveFromArr"));
  const { mediaType, tmdbId } = parseTitleParams(params);
  const body = await readJsonBody(request);
  const deleteFiles = optionalBoolean(body, "deleteFiles") ?? false;
  const fourK = optionalBoolean(body, "is4k") ?? false;
  await requireTmdbConfigured();

  const title = await requireTitle(mediaType, tmdbId);
  const result = unwrap(await removeTitleFromArr(ctx.user.id, mediaType, tmdbId, title.tvdbId, { deleteFiles, fourK }));
  return { ok: true, removedFrom: result.removedFrom, failed: result.failed, requestsMarked: result.requestsMarked };
});
