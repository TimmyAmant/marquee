export type ArrConfig = { baseUrl: string; apiKey: string };

async function sonarrFetch<T>(
  config: ArrConfig,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const url = new URL(`${config.baseUrl.replace(/\/$/, "")}/api/v3${path}`);
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "X-Api-Key": config.apiKey,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`Sonarr request failed: ${path} (${res.status})`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function testConnection(config: ArrConfig) {
  return sonarrFetch<{ version: string }>(config, "/system/status");
}

export interface SonarrRootFolder {
  id: number;
  path: string;
}

export function getRootFolders(config: ArrConfig) {
  return sonarrFetch<SonarrRootFolder[]>(config, "/rootfolder");
}

export interface SonarrQualityProfile {
  id: number;
  name: string;
}

export function getQualityProfiles(config: ArrConfig) {
  return sonarrFetch<SonarrQualityProfile[]>(config, "/qualityprofile");
}

export interface SonarrSeriesLookupResult {
  title: string;
  tvdbId: number;
  images: { coverType: string; url: string }[];
  seasons: unknown[];
  year: number;
}

export function lookupByTvdbId(config: ArrConfig, tvdbId: number) {
  return sonarrFetch<SonarrSeriesLookupResult[]>(
    config,
    `/series/lookup?term=${encodeURIComponent(`tvdb:${tvdbId}`)}`,
  );
}

export interface SonarrSeasonStats {
  seasonNumber: number;
  monitored: boolean;
  statistics?: {
    episodeFileCount: number;
    episodeCount: number;
  };
}

export interface SonarrSeries {
  id: number;
  tvdbId: number;
  status: string;
  monitored: boolean;
  path?: string;
  seasons?: SonarrSeasonStats[];
  statistics?: {
    episodeFileCount: number;
    episodeCount: number;
    sizeOnDisk: number;
  };
}

export async function getSeriesByTvdbId(config: ArrConfig, tvdbId: number): Promise<SonarrSeries | null> {
  const results = await sonarrFetch<SonarrSeries[]>(config, `/series?tvdbId=${tvdbId}`);
  return results[0] ?? null;
}

export function getAllSeries(config: ArrConfig): Promise<SonarrSeries[]> {
  return sonarrFetch<SonarrSeries[]>(config, "/series");
}

export async function setSeriesMonitored(
  config: ArrConfig,
  seriesId: number,
  monitored: boolean,
): Promise<void> {
  const series = await sonarrFetch<Record<string, unknown>>(config, `/series/${seriesId}`);
  await sonarrFetch(config, `/series/${seriesId}`, {
    method: "PUT",
    body: { ...series, monitored },
  });
}

export interface SonarrEpisode {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  hasFile: boolean;
  monitored: boolean;
}

export function getEpisodesBySeriesId(
  config: ArrConfig,
  seriesId: number,
  seasonNumber: number,
): Promise<SonarrEpisode[]> {
  return sonarrFetch<SonarrEpisode[]>(
    config,
    `/episode?seriesId=${seriesId}&seasonNumber=${seasonNumber}`,
  );
}

/** IDs of series with an active entry in Sonarr's download queue right now
 * — a real-time signal, unlike file-count statistics which only reflect the
 * last completed sync and only update once an episode finishes importing. */
export async function getQueuedSeriesIds(config: ArrConfig): Promise<Set<number>> {
  const res = await sonarrFetch<{ records: { seriesId: number }[] }>(
    config,
    "/queue?pageSize=250",
  );
  return new Set(res.records.map((r) => r.seriesId));
}

export function addSeries(
  config: ArrConfig,
  input: {
    lookupResult: SonarrSeriesLookupResult;
    qualityProfileId: number;
    rootFolderPath: string;
  },
) {
  return sonarrFetch<SonarrSeries>(config, "/series", {
    method: "POST",
    body: {
      ...input.lookupResult,
      qualityProfileId: input.qualityProfileId,
      rootFolderPath: input.rootFolderPath,
      monitored: true,
      addOptions: { searchForMissingEpisodes: true },
    },
  });
}
