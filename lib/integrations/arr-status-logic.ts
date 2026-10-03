import type { LibraryStatus } from "@/components/status-badge";
import type { RadarrMovie } from "@/lib/radarr/client";
import type { SonarrSeries } from "@/lib/sonarr/client";
import { isEpisodeCountComplete, sonarrEpisodeCounts } from "@/lib/library/episode-counts";

export function deriveRadarrStatus(movie: RadarrMovie): LibraryStatus {
  if (movie.hasFile && movie.movieFile) return "owned";
  // Present in Radarr but not monitored and nothing downloaded: it won't
  // download on its own (Radarr's orange "Missing (Unmonitored)"). Still
  // requestable, like a title that isn't there at all (isUnwanted).
  if (!movie.monitored) return "tracked_unmonitored";
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
  // Sonarr's series-level `episodeCount` can be 0 for a show that's fully
  // on disk (e.g. a finished miniseries with its seasons unmonitored), so
  // fall back to every episode, and then to the per-season count.
  if (stats?.totalEpisodeCount && stats.episodeFileCount >= stats.totalEpisodeCount) {
    return "owned";
  }
  const counts = sonarrEpisodeCounts(series.seasons, series.monitored);
  if (counts && counts.total > 0 && isEpisodeCountComplete(counts)) return "owned";
  if (stats && stats.episodeFileCount > 0) {
    return "tracked_downloading";
  }
  // Sonarr's orange "Missing episodes (series not monitored)".
  if (!series.monitored) return "tracked_unmonitored";
  // Sonarr sets a series' own status to "upcoming" when it hasn't started
  // airing yet — nothing to have downloaded, so "Missing" would be wrong.
  if (series.status === "upcoming") return "coming_soon";
  return "tracked_monitored";
}

/** One record from Radarr's or Sonarr's /queue. */
export type ArrQueueRecord = { trackedDownloadState?: string; sizeleft?: number };

/**
 * Whether a queue record is still on its way in: bytes left to download, or
 * being imported right now. A finished download can sit in the queue for
 * good — imported and seeding, or never imported at all (e.g. a torrent
 * saved straight into the client's download folder, which Radarr and Sonarr
 * won't import, so it stays "downloading" with nothing left). Counting those
 * would show the title as "Downloading" forever; leaving them out lets what's
 * actually on disk decide (Owned with a file, Missing without).
 */
export function isActiveQueueRecord(record: ArrQueueRecord): boolean {
  const state = record.trackedDownloadState;
  if (state === "imported") return false;
  if (state === "importPending" || state === "importing") return true;
  return record.sizeleft == null || record.sizeleft > 0;
}
