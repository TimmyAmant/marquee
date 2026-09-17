import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { ApiError } from "@/lib/api/errors";
import { parseIdSegment } from "@/lib/api/request";
import { statusKey, titleCard } from "@/lib/api/mappers";
import { loadCompanyPage } from "@/lib/pages/entities";
import type { CompanyDetail } from "@/lib/api/types";

/** A studio's page: description plus its catalog (newest first, as stored),
 * each with status, favorite and quick-add eligibility. */
export const GET = withApi<{ id: string }>(async (request, params): Promise<CompanyDetail> => {
  const ctx = await requireApiUser(request);
  const tmdbId = parseIdSegment(params.id, "TMDb company id");
  await requireTmdbConfigured();

  const data = await loadCompanyPage(await ctx.viewer(), tmdbId);
  if (!data) throw ApiError.of("not_found", "No such company on TMDb.");

  return {
    tmdbId,
    name: data.company.name,
    description: data.company.description,
    logoPath: data.company.logoPath,
    titleCount: data.company.count,
    favorited: data.favorited,
    titles: data.entries.map((entry) =>
      titleCard(entry, {
        status: entry.status ?? null,
        favorited: data.favoritedKeys.has(statusKey(entry.mediaType, entry.tmdbId)),
        canQuickAdd: !entry.status && data.arrConfigured[entry.mediaType],
      }),
    ),
  };
});
