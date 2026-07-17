import type { LibraryStatus } from "@/components/status-badge";
import type { RadarrMovie } from "@/lib/radarr/client";
import type { SonarrSeries } from "@/lib/sonarr/client";

export function deriveRadarrStatus(movie: RadarrMovie): LibraryStatus {
  if (movie.hasFile && movie.movieFile) return "owned";
  // Present in Radarr but not monitored and nothing downloaded — that's not
  // meaningfully different from not being in the library at all (matches
  // isDroppedArrRow's treatment of the cached equivalent of this state).
  if (!movie.monitored) return "untracked";
  // Radarr's own `status` field ("tba" | "announced" | "inCinemas" |
  // "released") already tracks release lifecycle — anything short of
  // "released" hasn't had a chance to be grabbed yet, so it's not
  // meaningfully "missing" the way an actually-overdue title is.
  if (movie.status !== "released") return "coming_soon";
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
  // Sonarr sets a series' own status to "upcoming" when it hasn't started
  // airing yet — nothing to have downloaded, so "Missing" would be wrong.
  if (series.status === "upcoming") return "coming_soon";
  return "tracked_monitored";
}
