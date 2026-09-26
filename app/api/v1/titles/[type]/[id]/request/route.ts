import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured, unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { parseTitleParams, requireTitle, type TitleParams } from "@/lib/api/routes/titles";
import { createRequest } from "@/lib/requests/mutate";
import { invalid } from "@/lib/api/request";
import { parseAddOverrides } from "@/lib/arr/add-options";

/** "Request" — asks the admin to add this title. Auto-approves immediately
 * when the admin enabled auto-approval for this member and media type. The
 * title name and poster are taken from the server's TMDb cache rather than
 * the client. For a TV show the body may name `seasons` (a list of season
 * numbers); without it (or null, or no body at all, as older clients send)
 * the request is for the whole series. createRequest validates the seasons
 * and ignores them for a movie. `is4k: true` makes it a 4K request (whole
 * title only, `seasons` ignored). Whoever may use Advanced request options
 * can also send the approve body's `serverId`, `qualityProfileId`,
 * `rootFolderPath`, `tags` and `seriesType`; they're used when it's
 * approved, unless the reviewer picks others. Anyone else sending them is
 * refused. What the account may ask for at all is its permissions
 * (requestMovies, request4kTv, …). */
export const POST = withApi<TitleParams>(async (request, params): Promise<{ ok: true; requestId: string }> => {
  const ctx = await requireApiUser(request);
  const { mediaType, tmdbId } = parseTitleParams(params);
  const body = await readJsonBody(request);
  await requireTmdbConfigured();

  const overrides = parseAddOverrides(body, mediaType);
  if (!overrides.ok) throw invalid(overrides.error);

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
      overrides: overrides.overrides,
    }),
  );
  return { ok: true, requestId };
});
