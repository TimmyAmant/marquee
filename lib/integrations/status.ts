import { getArrCredential } from "@/lib/integrations/credentials";
import * as sonarr from "@/lib/sonarr/client";
import * as radarr from "@/lib/radarr/client";
import { isTitleInPlexLibrary } from "@/lib/plex/sync";
import { deriveRadarrStatus, deriveSonarrStatus } from "@/lib/integrations/arr-status-logic";
import type { LibraryStatus } from "@/components/status-badge";

export type FileInfo = {
  path: string;
  sizeBytes: number;
  quality?: string;
};

export type TitleLibraryStatus = {
  status: LibraryStatus;
  provider: "plex" | "sonarr" | "radarr" | null;
  configured: boolean;
  file: FileInfo | null;
};

async function getArrStatus(
  userId: string,
  mediaType: "movie" | "tv",
  tmdbId: number,
  tvdbId: number | null,
): Promise<TitleLibraryStatus> {
  if (mediaType === "movie") {
    const credential = await getArrCredential(userId, "radarr");
    const configured = Boolean(credential?.qualityProfileId && credential?.rootFolderPath);
    if (!credential) return { status: "untracked", provider: "radarr", configured: false, file: null };

    const movie = await radarr
      .getMovieByTmdbId({ baseUrl: credential.baseUrl, apiKey: credential.apiKey }, tmdbId)
      .catch(() => null);

    if (!movie) return { status: "untracked", provider: "radarr", configured, file: null };

    const status = deriveRadarrStatus(movie);
    const file: FileInfo | null =
      status === "owned" && movie.movieFile
        ? {
            path: movie.movieFile.path,
            sizeBytes: movie.movieFile.size,
            quality: movie.movieFile.quality?.quality?.name,
          }
        : null;

    return { status, provider: "radarr", configured, file };
  }

  const credential = await getArrCredential(userId, "sonarr");
  const configured = Boolean(credential?.qualityProfileId && credential?.rootFolderPath);
  if (!credential) return { status: "untracked", provider: "sonarr", configured: false, file: null };
  if (!tvdbId) return { status: "untracked", provider: "sonarr", configured, file: null };

  const series = await sonarr
    .getSeriesByTvdbId({ baseUrl: credential.baseUrl, apiKey: credential.apiKey }, tvdbId)
    .catch(() => null);

  if (!series) return { status: "untracked", provider: "sonarr", configured, file: null };

  const status = deriveSonarrStatus(series);
  const file: FileInfo | null = series.statistics?.sizeOnDisk
    ? { path: series.path ?? "", sizeBytes: series.statistics.sizeOnDisk }
    : null;

  return { status, provider: "sonarr", configured, file: status === "untracked" ? null : file };
}

export async function getTitleLibraryStatus(
  userId: string,
  mediaType: "movie" | "tv",
  tmdbId: number,
  tvdbId: number | null,
): Promise<TitleLibraryStatus> {
  const ownedInPlex = await isTitleInPlexLibrary(userId, tmdbId, tvdbId).catch(() => false);
  if (ownedInPlex) {
    return { status: "owned", provider: "plex", configured: true, file: null };
  }

  return getArrStatus(userId, mediaType, tmdbId, tvdbId);
}

export type SeasonCompleteness = { seasonNumber: number; have: number; total: number };

/**
 * Per-season file-count completeness from Sonarr, for the have/total badge
 * on each row of the season accordion. Covers every season in one call (no
 * per-episode data) — cheap enough to fetch eagerly on page load. Returns
 * null when Sonarr isn't connected or isn't tracking this show — Plex only
 * tells us "owned" at the whole-show level, not per-season, so this is
 * Sonarr-only.
 */
export async function getSonarrSeasonCompleteness(
  userId: string,
  tvdbId: number | null,
): Promise<SeasonCompleteness[] | null> {
  if (!tvdbId) return null;

  const credential = await getArrCredential(userId, "sonarr");
  if (!credential) return null;

  const config = { baseUrl: credential.baseUrl, apiKey: credential.apiKey };
  const series = await sonarr.getSeriesByTvdbId(config, tvdbId).catch(() => null);
  if (!series) return null;

  return (series.seasons ?? [])
    .filter((s) => s.seasonNumber > 0 || (series.seasons?.length ?? 0) === 1)
    .map((s) => ({
      seasonNumber: s.seasonNumber,
      have: s.statistics?.episodeFileCount ?? 0,
      total: s.statistics?.episodeCount ?? 0,
    }));
}

/**
 * Per-episode file presence from Sonarr for a single season — fetched lazily
 * only when that season's row is expanded in the accordion, since a show
 * with dozens of seasons shouldn't pull every season's episode list upfront.
 */
export async function getSonarrEpisodeHasFileMap(
  userId: string,
  tvdbId: number | null,
  seasonNumber: number,
): Promise<Map<number, boolean>> {
  const episodeHasFile = new Map<number, boolean>();
  if (!tvdbId) return episodeHasFile;

  const credential = await getArrCredential(userId, "sonarr");
  if (!credential) return episodeHasFile;

  const config = { baseUrl: credential.baseUrl, apiKey: credential.apiKey };
  const series = await sonarr.getSeriesByTvdbId(config, tvdbId).catch(() => null);
  if (!series) return episodeHasFile;

  const episodes = await sonarr
    .getEpisodesBySeriesId(config, series.id, seasonNumber)
    .catch(() => []);
  for (const episode of episodes) {
    episodeHasFile.set(episode.episodeNumber, episode.hasFile);
  }
  return episodeHasFile;
}
