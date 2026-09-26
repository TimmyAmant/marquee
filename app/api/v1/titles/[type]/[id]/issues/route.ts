import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { parseTitleParams, type TitleParams } from "@/lib/api/routes/titles";
import { reportIssue } from "@/lib/issues";

/** "Report a problem" with this title. Body: `{ "kind": "audio",
 * "message": "…", "seasonNumber": 2, "episodeNumber": 5 }` (message
 * required for "other"; season/episode optional, TV only). Tells the admin. */
export const POST = withApi<TitleParams>(async (request, params): Promise<{ ok: true; issueId: string }> => {
  const ctx = await requireApiUser(request);
  const { mediaType, tmdbId } = parseTitleParams(params);
  const body = await readJsonBody(request);
  const { issueId } = unwrap(
    await reportIssue(ctx.user.id, mediaType, tmdbId, {
      kind: body.kind,
      message: body.message,
      seasonNumber: body.seasonNumber,
      episodeNumber: body.episodeNumber,
    }),
  );
  return { ok: true, issueId };
});
