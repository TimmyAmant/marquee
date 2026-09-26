import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured, unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { parseTitleParams, requireTitle, type TitleParams } from "@/lib/api/routes/titles";
import { createRequest } from "@/lib/requests/mutate";

/** "Request" — asks the admin to add this title. Auto-approves immediately
 * when the admin enabled auto-approval for this member and media type. The
 * title name and poster are taken from the server's TMDb cache rather than
 * the client. For a TV show the body may name `seasons` (a list of season
 * numbers); without it (or null, or no body at all, as older clients send)
 * the request is for the whole series. createRequest validates the seasons
 * and ignores them for a movie. `is4k: true` makes it a 4K request (whole
 * title only, `seasons` ignored). */
export const POST = withApi<TitleParams>(async (request, params): Promise<{ ok: true; requestId: string }> => {
  const ctx = await requireApiUser(request);
  const { mediaType, tmdbId } = parseTitleParams(params);
  const body = await readJsonBody(request);
  await requireTmdbConfigured();

  const title = await requireTitle(mediaType, tmdbId);
  const { requestId } = unwrap(
    await createRequest(await ctx.viewer(), {
      mediaType,
      tmdbId,
      title: title.name,
      posterPath: title.posterPath,
      seasons: body.seasons,
      // `"is4k": true` asks for the 4K copy (0.37+); anything else, or no
      // field, is a regular request.
      is4k: body.is4k === true,
    }),
  );
  return { ok: true, requestId };
});
