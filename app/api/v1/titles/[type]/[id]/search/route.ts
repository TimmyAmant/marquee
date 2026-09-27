import { withApi } from "@/lib/api/handler";
import { msg } from "@/lib/api/errors";
import { requireApiAdmin } from "@/lib/api/auth";
import { requireTmdbConfigured, unwrap } from "@/lib/api/guards";
import { parseTitleParams, requireTitle, type TitleParams } from "@/lib/api/routes/titles";
import { searchTitle } from "@/lib/arr/title-actions";
import type { Ok } from "@/lib/api/types";

/** Admin "Search now": queues an immediate Radarr/Sonarr search. */
export const POST = withApi<TitleParams>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiAdmin(request, msg("server.onlyAdminSearch"));
  const { mediaType, tmdbId } = parseTitleParams(params);
  await requireTmdbConfigured();

  const title = await requireTitle(mediaType, tmdbId);
  unwrap(await searchTitle(ctx.user.id, mediaType, tmdbId, title.tvdbId));
  return { ok: true };
});
