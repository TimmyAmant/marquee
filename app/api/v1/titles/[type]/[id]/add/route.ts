import { withApi } from "@/lib/api/handler";
import { invalid, readJsonBody } from "@/lib/api/request";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { parseTitleParams, type TitleParams } from "@/lib/api/routes/titles";
import { parseAddOverrides } from "@/lib/arr/add-options";
import { addTitleToLibrary } from "@/lib/arr/title-actions";
import type { Ok } from "@/lib/api/types";

/** "Add to Radarr/Sonarr" (title page) and poster-card quick-add. Uses the
 * caller's own Sonarr/Radarr servers and is refused (403) unless the caller
 * is the admin — the same check the web action makes. Body
 * `{ "is4k": true }` adds it to the default 4K server instead (0.37+); no
 * body, or anything else, is the default standard one. 0.43+: the body may
 * also pick the server, quality profile, root folder, tags and series type
 * (the same fields as approving a request). */
export const POST = withApi<TitleParams>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiUser(request);
  const { mediaType, tmdbId } = parseTitleParams(params);
  const body = await readJsonBody(request);
  const parsed = parseAddOverrides(body, mediaType);
  if (!parsed.ok) throw invalid(parsed.error);
  unwrap(await addTitleToLibrary(ctx.user.id, mediaType, tmdbId, body.is4k === true, parsed.overrides));
  return { ok: true };
});
