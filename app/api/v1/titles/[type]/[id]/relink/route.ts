import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { optionalNumberish, readJsonBody } from "@/lib/api/request";
import { parseTitleParams, type TitleParams } from "@/lib/api/routes/titles";
import { relinkTitle } from "@/lib/arr/title-actions";
import type { RelinkResult } from "@/lib/api/types";

/** Admin "Wrong match? Fix ID": repoints this title's synced library rows to a
 * different TMDb title. Body: one of tmdbId, imdbId, tvdbId (TV only) —
 * checked in that order, like the web form. */
export const POST = withApi<TitleParams>(async (request, params): Promise<RelinkResult> => {
  const ctx = await requireApiAdmin(request, "Only the admin can correct a title's match.");
  const { mediaType, tmdbId } = parseTitleParams(params);
  const body = await readJsonBody(request);

  const { newTmdbId } = unwrap(
    await relinkTitle(ctx.user.id, mediaType, tmdbId, {
      tmdbId: optionalNumberish(body, "tmdbId"),
      imdbId: optionalNumberish(body, "imdbId"),
      tvdbId: optionalNumberish(body, "tvdbId"),
    }),
  );
  return { ok: true, newTmdbId };
});
