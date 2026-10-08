import { seasonsForAdd, seasonsForUpdate, seasonsForWholeSeries } from "@/lib/sonarr/season-monitoring";
import { arrRequestError } from "@/lib/arr/errors";
import { summarizeQueue, type ArrQueueRecord, type QueueSummary } from "@/lib/integrations/arr-status-logic";

export type ArrConfig = { baseUrl: string; apiKey: string };

// See the same constant in lib/radarr/client.ts — a slow/unreachable Sonarr
// instance shouldn't be able to hang a page render indefinitely.
const REQUEST_TIMEOUT_MS = 8000;

// See LIBRARY_TIMEOUT_MS in lib/radarr/client.ts.
const LIBRARY_TIMEOUT_MS = 120_000;

// See ADD_TIMEOUT_MS in lib/radarr/client.ts.
const ADD_TIMEOUT_MS = 45_000;

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

  if (!res.ok) throw await arrRequestError("Sonarr", path, res);

  // A delete answers with nothing to read (or an empty object).
  if (res.status === 204 || options.method === "DELETE") return undefined as T;
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

export interface SonarrTag {
  id: number;
  label: string;
}

export function getTags(config: ArrConfig) {
  return sonarrFetch<SonarrTag[]>(config, "/tag");
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
    { timeoutMs: ADD_TIMEOUT_MS },
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
    /** The season's next monitored episode's air date, if one is due. */
    nextAiring?: string | null;
  };
}

export interface SonarrSeries {
  id: number;
  tvdbId: number;
  /** Sonarr v4 knows the show's TMDb id too; 0 or missing when it doesn't. */
  tmdbId?: number;
  title?: string;
  /** The show's page in Sonarr is /series/{titleSlug}. */
  titleSlug?: string;
  status: string;
  monitored: boolean;
  path?: string;
  qualityProfileId?: number;
  seasons?: SonarrSeasonStats[];
  statistics?: {
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount?: number;
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
export function buildMonitorSeasonsBody<S extends { seasons?: SonarrSeasonStats[]; monitored?: unknown }>(
  series: S,
  requested: readonly number[],
) {
  return {
    ...series,
    monitored: true,
    seasons: seasonsForUpdate(series.seasons ?? [], requested, series.monitored !== false),
  };
}

/** Approving a whole-series request on a series Sonarr already has: the
 * series and every season (specials only if already on) monitored. */
export async function monitorWholeSeries(config: ArrConfig, seriesId: number): Promise<void> {
  const series = await sonarrFetch<Record<string, unknown> & { seasons?: SonarrSeasonStats[] }>(
    config,
    `/series/${seriesId}`,
  );
  await sonarrFetch(config, `/series/${seriesId}`, {
    method: "PUT",
    body: buildMonitorWholeSeriesBody(series),
  });
}

/** The PUT /series/{id} body for monitorWholeSeries. */
export function buildMonitorWholeSeriesBody<S extends { seasons?: SonarrSeasonStats[]; monitored?: unknown }>(
  series: S,
) {
  return {
    ...series,
    monitored: true,
    seasons: seasonsForWholeSeries(series.seasons ?? [], series.monitored !== false),
  };
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

/** Removes the series from Sonarr (the title page's "Remove from Sonarr"),
 * and its files too when `deleteFiles`. */
export async function deleteSeries(config: ArrConfig, seriesId: number, deleteFiles: boolean): Promise<void> {
  await sonarrFetch(config, `/series/${seriesId}?deleteFiles=${deleteFiles}&addImportListExclusion=false`, { method: "DELETE" });
}

export interface SonarrEpisode {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  hasFile: boolean;
  monitored: boolean;
  /** When it first aired (UTC); missing for one with no date yet. */
  airDateUtc?: string;
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

/** Every episode of a series, all seasons, specials included — one call
 * however many seasons it has. A long-running show's list is big, so this
 * gets the library timeout rather than a page's. */
export function getAllEpisodes(config: ArrConfig, seriesId: number): Promise<SonarrEpisode[]> {
  return sonarrFetch<SonarrEpisode[]>(config, `/episode?seriesId=${seriesId}`, { timeoutMs: LIBRARY_TIMEOUT_MS });
}

/** One series by Sonarr's own id. */
export function getSeries(config: ArrConfig, seriesId: number): Promise<SonarrSeries> {
  return sonarrFetch<SonarrSeries>(config, `/series/${seriesId}`);
}

/** Has Sonarr look in the series' folder again, so episodes moved there by
 * hand are picked up. Fire-and-forget: Sonarr runs it in the background. */
export async function rescanSeries(config: ArrConfig, seriesId: number): Promise<void> {
  await sonarrFetch(config, "/command", { method: "POST", body: { name: "RescanSeries", seriesId } });
}

/** The queue, one summary per series (lib/integrations/arr-status-logic.ts).
 * Every record is in it, finished ones included: a title with any record has
 * had a release found for it. */
export async function getQueueSummaries(config: ArrConfig): Promise<Map<number, QueueSummary>> {
  const res = await sonarrFetch<{ records: ({ seriesId: number } & ArrQueueRecord)[] }>(
    config,
    "/queue?pageSize=1000",
  );
  return summarizeQueue(res.records, (r) => r.seriesId);
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
    /** Sonarr v4 knows the show's TMDb id too; 0 or missing when it doesn't. */
    tmdbId?: number;
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
  /** Each omitted one keeps what Sonarr's lookup result has. */
  tags?: readonly number[];
  seriesType?: "standard" | "daily" | "anime";
  seasonFolder?: boolean;
};

/** The POST /series body. With `seasons`, only those are monitored, and the
 * search-on-add only looks for monitored episodes, so it fetches just them. */
export function buildAddSeriesBody(input: AddSeriesInput) {
  return {
    ...input.lookupResult,
    qualityProfileId: input.qualityProfileId,
    rootFolderPath: input.rootFolderPath,
    ...(input.tags ? { tags: [...input.tags] } : {}),
    ...(input.seriesType ? { seriesType: input.seriesType } : {}),
    ...(input.seasonFolder !== undefined ? { seasonFolder: input.seasonFolder } : {}),
    monitored: true,
    ...(input.seasons ? { seasons: seasonsForAdd(input.lookupResult.seasons ?? [], input.seasons) } : {}),
    addOptions: { searchForMissingEpisodes: true },
  };
}

export function addSeries(config: ArrConfig, input: AddSeriesInput) {
  return sonarrFetch<SonarrSeries>(config, "/series", {
    method: "POST",
    timeoutMs: ADD_TIMEOUT_MS,
    body: buildAddSeriesBody(input),
  });
}
