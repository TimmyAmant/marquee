import type { LibraryStatus } from "@/components/status-badge";
import type { RadarrMovie } from "@/lib/radarr/client";
import type { SonarrSeries } from "@/lib/sonarr/client";

export function deriveRadarrStatus(movie: RadarrMovie): LibraryStatus {
  if (movie.hasFile && movie.movieFile) return "owned";
  // Present in Radarr but not monitored and nothing downloaded — that's not
  // meaningfully different from not being in the library at all (matches
  // isDroppedArrRow's treatment of the cached equivalent of this state).
  if (!movie.monitored) return "untracked";
  return "tracked_monitored";
}

export function deriveSonarrStatus(series: SonarrSeries): LibraryStatus {
  const stats = series.statistics;
  if (stats && stats.episodeCount > 0 && stats.episodeFileCount >= stats.episodeCount) {
    return "owned";
  }
  if (stats && stats.episodeFileCount > 0) {
    return "tracked_downloading";
  }
  if (!series.monitored) return "untracked";
  return "tracked_monitored";
}
