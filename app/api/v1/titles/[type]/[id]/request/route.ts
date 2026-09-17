import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured, unwrap } from "@/lib/api/guards";
import { parseTitleParams, requireTitle, type TitleParams } from "@/lib/api/routes/titles";
import { createRequest } from "@/lib/requests/mutate";

/** "Request" — asks the admin to add this title. Auto-approves immediately
 * when the admin enabled auto-approval for this member and media type. The
 * title name and poster are taken from the server's TMDb cache rather than
 * the client. */
export const POST = withApi<TitleParams>(async (request, params): Promise<{ ok: true; requestId: string }> => {
  const ctx = await requireApiUser(request);
  const { mediaType, tmdbId } = parseTitleParams(params);
  await requireTmdbConfigured();

  const title = await requireTitle(mediaType, tmdbId);
  const { requestId } = unwrap(
    await createRequest(await ctx.viewer(), {
      mediaType,
      tmdbId,
      title: title.name,
      posterPath: title.posterPath,
    }),
  );
  return { ok: true, requestId };
});
