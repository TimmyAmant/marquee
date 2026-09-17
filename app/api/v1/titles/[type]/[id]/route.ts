import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { ApiError } from "@/lib/api/errors";
import { parseTitleParams, requireTitle, type TitleParams } from "@/lib/api/routes/titles";
import { titleDetailDto } from "@/lib/api/title-dto";
import { loadTitlePage } from "@/lib/pages/title";
import type { TitleDetail } from "@/lib/api/types";

/** Everything the title page renders for this viewer. */
export const GET = withApi<TitleParams>(async (request, params): Promise<TitleDetail> => {
  const ctx = await requireApiUser(request);
  const { mediaType, tmdbId } = parseTitleParams(params);
  await requireTmdbConfigured();

  // Surfaces a real TMDb outage as 502 instead of the page loader's
  // "not found" (it swallows fetch errors the way the page's notFound() does).
  await requireTitle(mediaType, tmdbId);

  const data = await loadTitlePage(await ctx.viewer(), mediaType, tmdbId);
  if (!data) throw ApiError.of("not_found", "No such title on TMDb.");

  return titleDetailDto(mediaType, tmdbId, ctx.user.isAdmin, data);
});
