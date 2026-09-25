import { seasonsForAdd, seasonsForUpdate } from "@/lib/sonarr/season-monitoring";

export type ArrConfig = { baseUrl: string; apiKey: string };

// See the same constant in lib/radarr/client.ts — a slow/unreachable Sonarr
// instance shouldn't be able to hang a page render indefinitely.
const REQUEST_TIMEOUT_MS = 8000;

// See LIBRARY_TIMEOUT_MS in lib/radarr/client.ts.
const LIBRARY_TIMEOUT_MS = 120_000;

async function sonarrFetch<T>(
  config: ArrConfig,
  path: string,
  options: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const url = new URL(`${config.baseUrl.replace(/\/$/, "")}/api/v3${path}`);
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "X-Api-Key": config.apiKey,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
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
  freeSpace?: number;
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
  seasons: { seasonNumber: number; monitored?: boolean }[];
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
    /** Every episode of the season, monitored or not, aired or not. */
    totalEpisodeCount?: number;
  };
}

export interface SonarrSeries {
  id: number;
  tvdbId: number;
  status: string;
  monitored: boolean;
  path?: string;
  qualityProfileId?: number;
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
  return sonarrFetch<SonarrSeries[]>(config, "/series", { timeoutMs: LIBRARY_TIMEOUT_MS });
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

/** A season request for a series Sonarr already has: monitors the series
 * and the requested seasons on top of whatever it already monitors. Sonarr
 * carries a season's monitored flag down to its episodes on update. */
export async function monitorSeriesSeasons(
  config: ArrConfig,
  seriesId: number,
  requested: readonly number[],
): Promise<void> {
  const series = await sonarrFetch<Record<string, unknown> & { seasons?: SonarrSeasonStats[] }>(
    config,
    `/series/${seriesId}`,
  );
  await sonarrFetch(config, `/series/${seriesId}`, {
    method: "PUT",
    body: buildMonitorSeasonsBody(series, requested),
  });
}

/** The PUT /series/{id} body for monitorSeriesSeasons: the series exactly as
 * Sonarr sent it, with monitoring switched on for it and the requested seasons. */
export function buildMonitorSeasonsBody<S extends { seasons?: SonarrSeasonStats[] }>(
  series: S,
  requested: readonly number[],
) {
  return { ...series, monitored: true, seasons: seasonsForUpdate(series.seasons ?? [], requested) };
}

/** Queues a search for one season's monitored episodes, same as the search
 * button on a season in Sonarr — fire-and-forget like searchSeries. */
export async function searchSeason(config: ArrConfig, seriesId: number, seasonNumber: number): Promise<void> {
  await sonarrFetch(config, "/command", {
    method: "POST",
    body: { name: "SeasonSearch", seriesId, seasonNumber },
  });
}

/** Queues an immediate search for every monitored episode of this series,
 * same as Sonarr's own "Search Monitored" button — fire-and-forget, Sonarr
 * runs it asynchronously and there's nothing meaningful to poll for
 * completion here. */
export async function searchSeries(config: ArrConfig, seriesId: number): Promise<void> {
  await sonarrFetch(config, "/command", {
    method: "POST",
    body: { name: "SeriesSearch", seriesId },
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

export interface SonarrCalendarEpisode {
  id: number;
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  /** yyyy-mm-dd — the air date as the network lists it, not a UTC slice. */
  airDate?: string;
  airDateUtc?: string;
  hasFile: boolean;
  monitored: boolean;
  series?: {
    title: string;
    tvdbId: number;
    images?: { coverType: string; remoteUrl?: string; url?: string }[];
  };
}

/** Episodes airing in the given window — the source of truth Sonarr itself
 * tracks, rather than re-deriving air dates from TMDb. */
export function getCalendar(
  config: ArrConfig,
  start: Date,
  end: Date,
): Promise<SonarrCalendarEpisode[]> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    unmonitored: "true",
    includeSeries: "true",
  });
  return sonarrFetch<SonarrCalendarEpisode[]>(config, `/calendar?${params.toString()}`);
}

export type AddSeriesInput = {
  lookupResult: SonarrSeriesLookupResult;
  qualityProfileId: number;
  rootFolderPath: string;
  /** A season request's seasons; null or omitted adds the whole series the
   * way Sonarr's lookup result describes it. */
  seasons?: readonly number[] | null;
};

/** The POST /series body. With `seasons`, only those are monitored, and the
 * search-on-add only looks for monitored episodes, so it fetches just them. */
export function buildAddSeriesBody(input: AddSeriesInput) {
  return {
    ...input.lookupResult,
    qualityProfileId: input.qualityProfileId,
    rootFolderPath: input.rootFolderPath,
    monitored: true,
    ...(input.seasons ? { seasons: seasonsForAdd(input.lookupResult.seasons ?? [], input.seasons) } : {}),
    addOptions: { searchForMissingEpisodes: true },
  };
}

export function addSeries(config: ArrConfig, input: AddSeriesInput) {
  return sonarrFetch<SonarrSeries>(config, "/series", {
    method: "POST",
    body: buildAddSeriesBody(input),
  });
}
