import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { parseTitleParams, type TitleParams } from "@/lib/api/routes/titles";
import { addTitleToLibrary } from "@/lib/arr/title-actions";
import type { Ok } from "@/lib/api/types";

/** "Add to Radarr/Sonarr" (title page) and poster-card quick-add. Uses the
 * caller's own Sonarr/Radarr credential and is refused (403) unless the
 * caller is the admin — the same check the web action makes. */
export const POST = withApi<TitleParams>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiUser(request);
  const { mediaType, tmdbId } = parseTitleParams(params);
  unwrap(await addTitleToLibrary(ctx.user.id, mediaType, tmdbId));
  return { ok: true };
});
