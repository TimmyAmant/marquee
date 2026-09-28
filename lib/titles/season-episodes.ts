import { getTvSeasonDetails, viewerContentLanguage } from "@/lib/tmdb/client";
import { mergeEpisodes } from "@/lib/tmdb/language";
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
  // The viewer's language fills in over the English list, episode by
  // episode and field by field: TMDb leaves an untranslated overview blank
  // and names an untranslated episode "Episodio 3".
  const language = await viewerContentLanguage();
  const [details, translated, hasFileMap] = await Promise.all([
    getTvSeasonDetails(tmdbId, seasonNumber).catch(() => null),
    language === "en-US" ? Promise.resolve(null) : getTvSeasonDetails(tmdbId, seasonNumber, language).catch(() => null),
    viewer.libraryOwnerId
      ? getSonarrEpisodeHasFileMap(viewer.libraryOwnerId, tvdbId, seasonNumber)
      : Promise.resolve(new Map<number, boolean>()),
  ]);

  const episodes = details?.episodes ?? translated?.episodes ?? [];
  return { episodes: details ? mergeEpisodes(episodes, translated?.episodes) : episodes, hasFileMap };
}
