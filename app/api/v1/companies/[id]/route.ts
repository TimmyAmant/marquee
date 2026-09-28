import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { ApiError, msg } from "@/lib/api/errors";
import { parseIdSegment } from "@/lib/api/request";
import { externalLinkDtos, knownForTitleDto, statusKey, titleCard } from "@/lib/api/mappers";
import { posterActions } from "@/lib/api/poster-actions";
import { loadPosterActionRules } from "@/lib/api/poster-action-rules";
import { loadCompanyPage } from "@/lib/pages/entities";
import type { CompanyDetail } from "@/lib/api/types";

/** A studio's page: description plus its catalog (newest first, as stored),
 * each with status, favorite and the viewer's quick action
 * (lib/api/poster-actions.ts). */
export const GET = withApi<{ id: string }>(async (request, params): Promise<CompanyDetail> => {
  const ctx = await requireApiUser(request);
  const tmdbId = parseIdSegment(params.id, "TMDb company id");
  await requireTmdbConfigured();

  const data = await loadCompanyPage(await ctx.viewer(), tmdbId);
  if (!data) throw ApiError.of("not_found", msg("server.noSuchCompany"));
  const rules = await loadPosterActionRules(ctx.user, data.entries, data.arrConfigured);

  return {
    tmdbId,
    name: data.company.name,
    description: data.company.description,
    logoPath: data.company.logoPath,
    titleCount: data.company.count,
    favorited: data.favorited,
    knownForTitle: knownForTitleDto(data.knownFor),
    externalLinks: externalLinkDtos(data.links),
    titles: data.entries.map((entry) =>
      titleCard(entry, {
        status: entry.status ?? null,
        episodes: entry.episodes,
        favorited: data.favoritedKeys.has(statusKey(entry.mediaType, entry.tmdbId)),
        ...posterActions(rules, entry.mediaType, entry.tmdbId, entry.status),
      }),
    ),
  };
});
