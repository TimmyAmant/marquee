import { getTvSeasonDetails } from "@/lib/tmdb/client";
import { getSonarrEpisodeHasFileMap } from "@/lib/integrations/status";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import type { TmdbEpisode } from "@/lib/tmdb/client";

export type SeasonEpisodes = {
  episodes: TmdbEpisode[];
  hasFileMap: Map<number, boolean>;
};

/** One season's episode list + Sonarr file presence — loaded lazily when a
 * season row is expanded (web) or requested (API), rather than fetched
 * upfront for every season a show has. */
export async function loadSeasonEpisodes(
  viewer: ViewerIdentity,
  tmdbId: number,
  tvdbId: number | null,
  seasonNumber: number,
): Promise<SeasonEpisodes> {
  const [details, hasFileMap] = await Promise.all([
    getTvSeasonDetails(tmdbId, seasonNumber).catch(() => null),
    viewer.libraryOwnerId
      ? getSonarrEpisodeHasFileMap(viewer.libraryOwnerId, tvdbId, seasonNumber)
      : Promise.resolve(new Map<number, boolean>()),
  ]);

  return { episodes: details?.episodes ?? [], hasFileMap };
}
