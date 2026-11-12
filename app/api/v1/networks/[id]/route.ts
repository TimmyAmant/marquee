import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { ApiError, msg } from "@/lib/api/errors";
import { parseIdSegment } from "@/lib/api/request";
import { externalLinkDtos, knownForTitleDto, statusKey, titleCard } from "@/lib/api/mappers";
import { posterActions } from "@/lib/api/poster-actions";
import { loadPosterActionRules } from "@/lib/api/poster-action-rules";
import { loadNetworkPage } from "@/lib/pages/entities";
import type { CompanyDetail } from "@/lib/api/types";

/** A TV network's page (0.76+): the same shape as a studio's
 * (`CompanyDetail`), its series newest first; `favorited` is always false
 * and `description` null. */
export const GET = withApi<{ id: string }>(async (request, params): Promise<CompanyDetail> => {
  const ctx = await requireApiUser(request);
  const tmdbId = parseIdSegment(params.id, "TMDb network id");
  await requireTmdbConfigured();

  const data = await loadNetworkPage(await ctx.viewer(), tmdbId);
  if (!data) throw ApiError.of("not_found", msg("server.noSuchNetwork"));
  const rules = await loadPosterActionRules(ctx.user, data.entries, data.arrConfigured);

  return {
    tmdbId,
    name: data.network.name,
    description: null,
    logoPath: data.network.logoPath,
    titleCount: data.network.count,
    favorited: false,
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
