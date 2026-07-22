import { getArrCredential } from "@/lib/integrations/credentials";
import * as sonarr from "@/lib/sonarr/client";
import * as radarr from "@/lib/radarr/client";
import { getPlexFileInfo } from "@/lib/plex/sync";
import { getJellyfinFileInfo } from "@/lib/jellyfin/sync";
import { deriveRadarrStatus, deriveSonarrStatus } from "@/lib/integrations/arr-status-logic";
import type { LibraryStatus } from "@/components/status-badge";

export type FileInfo = {
  /** For Plex-owned TV, this is the folder every episode's file has in
   * common (derived at sync time from per-episode paths, since Plex only
   * reports Media/Part on individual episodes, not the show itself) —
   * falls back to Sonarr's series path if that derivation ever comes back
   * null. Always present when `file` itself is non-null (only ever set for
   * fully "owned" items, never for downloading/missing/monitored). */
  path: string | null;
  sizeBytes: number;
  quality?: string;
  /** Movie-only for now — Sonarr has no per-series file mediaInfo without a
   * per-episode expansion (episode-to-episode quality can vary anyway), so
   * these stay undefined for TV. All come free off the same Radarr
   * `/movie?tmdbId=X` call already made for `quality` above. */
  resolution?: string;
  videoCodec?: string;
  dynamicRange?: string;
  audioCodec?: string;
  audioChannels?: number;
  dateAdded?: string;
  releaseGroup?: string;
  edition?: string;
};

export type TitleLibraryStatus = {
  status: LibraryStatus;
  provider: "plex" | "jellyfin" | "sonarr" | "radarr" | null;
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
            resolution: movie.movieFile.mediaInfo?.resolution,
            videoCodec: movie.movieFile.mediaInfo?.videoCodec,
            dynamicRange: movie.movieFile.mediaInfo?.videoDynamicRangeType || undefined,
            audioCodec: movie.movieFile.mediaInfo?.audioCodec,
            audioChannels: movie.movieFile.mediaInfo?.audioChannels,
            dateAdded: movie.movieFile.dateAdded,
            releaseGroup: movie.movieFile.releaseGroup,
            edition: movie.movieFile.edition || undefined,
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
  // Only a fully-owned series gets a location shown — a partially-downloaded
  // one (status "tracked_downloading") already has some episode files and
  // thus a nonzero sizeOnDisk, but showing a path/size for something still
  // incomplete would read as "this is done" when it isn't.
  const file: FileInfo | null =
    status === "owned" && series.statistics?.sizeOnDisk
      ? { path: series.path ?? null, sizeBytes: series.statistics.sizeOnDisk }
      : null;

  return { status, provider: "sonarr", configured, file };
}

/**
 * A media-server-owned TV show (Plex/Jellyfin) often has no folder path or
 * quality info of its own — Plex only reports Media/Part per-episode, and
 * Jellyfin doesn't carry a resolved quality profile at all. Most households
 * running Sonarr have that same show tracked there too, so fall back to
 * Sonarr's series path + quality profile name to fill the gap rather than
 * leaving the File details section nearly empty for TV.
 */
async function getSonarrFileExtras(
  userId: string,
  tvdbId: number | null,
): Promise<{ path: string | null; quality: string | null } | null> {
  if (!tvdbId) return null;

  const credential = await getArrCredential(userId, "sonarr");
  if (!credential) return null;
  const config = { baseUrl: credential.baseUrl, apiKey: credential.apiKey };

  // These two don't depend on each other's result — fetching the quality
  // profile list only after confirming the series exists would add a
  // second round-trip to Sonarr for no reason, since a small unused list
  // fetch costs far less than another full network round-trip.
  const [series, profiles] = await Promise.all([
    sonarr.getSeriesByTvdbId(config, tvdbId).catch(() => null),
    sonarr.getQualityProfiles(config).catch(() => []),
  ]);
  if (!series) return null;

  const quality = series.qualityProfileId
    ? (profiles.find((p) => p.id === series.qualityProfileId)?.name ?? null)
    : null;

  return { path: series.path ?? null, quality };
}

export async function getTitleLibraryStatus(
  userId: string,
  mediaType: "movie" | "tv",
  tmdbId: number,
  tvdbId: number | null,
): Promise<TitleLibraryStatus> {
  // Plex/Jellyfin lookups are cheap local DB reads, not live API calls, so
  // firing all three up front (Sonarr extras too, for TV) costs one extra
  // DB query in the common case but saves a full sequential round-trip to
  // Sonarr — previously only fetched after Plex/Jellyfin ownership was
  // already confirmed, one after the other.
  const [plexFile, jellyfinFile, sonarrExtra] = await Promise.all([
    getPlexFileInfo(userId, tmdbId, tvdbId).catch(() => null),
    getJellyfinFileInfo(userId, tmdbId, tvdbId).catch(() => null),
    mediaType === "tv" ? getSonarrFileExtras(userId, tvdbId).catch(() => null) : Promise.resolve(null),
  ]);

  if (plexFile) {
    return {
      status: "owned",
      provider: "plex",
      configured: true,
      file: {
        path: plexFile.path ?? sonarrExtra?.path ?? null,
        sizeBytes: plexFile.sizeBytes ?? 0,
        quality: sonarrExtra?.quality ?? undefined,
        dateAdded: plexFile.addedAt?.toISOString(),
      },
    };
  }

  if (jellyfinFile) {
    return {
      status: "owned",
      provider: "jellyfin",
      configured: true,
      file: {
        path: jellyfinFile.path ?? sonarrExtra?.path ?? null,
        sizeBytes: jellyfinFile.sizeBytes ?? 0,
        quality: sonarrExtra?.quality ?? undefined,
        dateAdded: jellyfinFile.addedAt?.toISOString(),
      },
    };
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

export type ArrTrackingInfo = { arrId: number; monitored: boolean };

/**
 * Whether this title has an entry in Radarr/Sonarr at all, independent of
 * `getTitleLibraryStatus`'s provider — a title can be "owned" via Plex/
 * Jellyfin while still being separately tracked (and searchable/
 * monitorable) in Radarr/Sonarr, the common setup for most households, so
 * this can't just reuse the provider already resolved there.
 */
export async function getArrTrackingInfo(
  userId: string,
  mediaType: "movie" | "tv",
  tmdbId: number,
  tvdbId: number | null,
): Promise<ArrTrackingInfo | null> {
  if (mediaType === "movie") {
    const credential = await getArrCredential(userId, "radarr");
    if (!credential) return null;
    const config = { baseUrl: credential.baseUrl, apiKey: credential.apiKey };
    const movie = await radarr.getMovieByTmdbId(config, tmdbId).catch(() => null);
    return movie ? { arrId: movie.id, monitored: movie.monitored } : null;
  }

  if (!tvdbId) return null;
  const credential = await getArrCredential(userId, "sonarr");
  if (!credential) return null;
  const config = { baseUrl: credential.baseUrl, apiKey: credential.apiKey };
  const series = await sonarr.getSeriesByTvdbId(config, tvdbId).catch(() => null);
  return series ? { arrId: series.id, monitored: series.monitored } : null;
}
