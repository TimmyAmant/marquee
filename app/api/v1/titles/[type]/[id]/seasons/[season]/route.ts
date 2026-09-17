import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { ApiError } from "@/lib/api/errors";
import { parseTitleParams, requireTitle, type TitleParams } from "@/lib/api/routes/titles";
import { loadSeasonEpisodes } from "@/lib/titles/season-episodes";
import type { SeasonEpisodes } from "@/lib/api/types";

/** One season's episodes (the expanded accordion row), with Sonarr's
 * per-episode "have it / missing" when Sonarr tracks the show. */
export const GET = withApi<TitleParams & { season: string }>(async (request, params): Promise<SeasonEpisodes> => {
  const ctx = await requireApiUser(request);
  const { mediaType, tmdbId } = parseTitleParams(params);
  if (mediaType !== "tv") throw ApiError.of("not_found", "Only TV shows have seasons.");
  const seasonNumber = Number(params.season);
  if (!/^\d+$/.test(params.season) || !Number.isSafeInteger(seasonNumber)) {
    throw ApiError.of("not_found", `Invalid season "${params.season}".`);
  }
  await requireTmdbConfigured();

  const title = await requireTitle("tv", tmdbId);
  const { episodes, hasFileMap } = await loadSeasonEpisodes(await ctx.viewer(), tmdbId, title.tvdbId, seasonNumber);

  return {
    tmdbId,
    seasonNumber,
    episodes: episodes.map((episode) => ({
      id: episode.id,
      episodeNumber: episode.episode_number,
      name: episode.name,
      overview: episode.overview || null,
      airDate: episode.air_date || null,
      stillPath: episode.still_path,
      hasFile: hasFileMap.has(episode.episode_number) ? hasFileMap.get(episode.episode_number)! : null,
    })),
  };
});
