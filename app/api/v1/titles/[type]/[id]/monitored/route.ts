import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { requireTmdbConfigured, unwrap } from "@/lib/api/guards";
import { readJsonBody, requiredBoolean } from "@/lib/api/request";
import { parseTitleParams, requireTitle, type TitleParams } from "@/lib/api/routes/titles";
import { setTitleMonitored } from "@/lib/arr/title-actions";

/** Admin "Stop/Start monitoring" in Radarr/Sonarr. Body: { "monitored": bool }. */
export const PUT = withApi<TitleParams>(async (request, params): Promise<{ ok: true; monitored: boolean }> => {
  const ctx = await requireApiAdmin(request, "Only the admin can change monitoring.");
  const { mediaType, tmdbId } = parseTitleParams(params);
  const monitored = requiredBoolean(await readJsonBody(request), "monitored");
  await requireTmdbConfigured();

  const title = await requireTitle(mediaType, tmdbId);
  unwrap(await setTitleMonitored(ctx.user.id, mediaType, tmdbId, title.tvdbId, monitored));
  return { ok: true, monitored };
});
