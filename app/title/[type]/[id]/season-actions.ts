"use server";

import { getTvSeasonDetails } from "@/lib/tmdb/client";
import { getSonarrEpisodeHasFileMap } from "@/lib/integrations/status";
import { getViewerContext } from "@/lib/integrations/library-owner";
import type { TmdbEpisode } from "@/lib/tmdb/client";

export type SeasonEpisodesResult = {
  episodes: TmdbEpisode[];
  hasFileMap: Record<number, boolean>;
};

/** Lazily loads one season's episode list + Sonarr file-presence, called
 * when a season row is expanded in the accordion rather than fetched
 * upfront for every season a show has. */
export async function getSeasonEpisodesAction(
  tmdbId: number,
  tvdbId: number | null,
  seasonNumber: number,
): Promise<SeasonEpisodesResult> {
  const viewer = await getViewerContext();

  const [details, hasFileMap] = await Promise.all([
    getTvSeasonDetails(tmdbId, seasonNumber).catch(() => null),
    viewer.libraryOwnerId
      ? getSonarrEpisodeHasFileMap(viewer.libraryOwnerId, tvdbId, seasonNumber)
      : Promise.resolve(new Map<number, boolean>()),
  ]);

  return {
    episodes: details?.episodes ?? [],
    hasFileMap: Object.fromEntries(hasFileMap),
  };
}
