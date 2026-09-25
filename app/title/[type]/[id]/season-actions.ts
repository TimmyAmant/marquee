"use server";

import { getViewerContext } from "@/lib/integrations/library-owner";
import { loadSeasonEpisodes } from "@/lib/titles/season-episodes";
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
  // Server actions are reachable without going through the page, so don't
  // lean on the proxy's redirect: this one spends the instance's TMDb and
  // Sonarr credentials, and only signed-in accounts get to do that.
  if (!viewer.session) return { episodes: [], hasFileMap: {} };
  const { episodes, hasFileMap } = await loadSeasonEpisodes(viewer, tmdbId, tvdbId, seasonNumber);
  return { episodes, hasFileMap: Object.fromEntries(hasFileMap) };
}
