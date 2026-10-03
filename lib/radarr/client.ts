import { summarizeQueue, type ArrQueueRecord, type QueueSummary } from "@/lib/integrations/arr-status-logic";

export type ArrConfig = { baseUrl: string; apiKey: string };

// Without this, a slow or unreachable Radarr instance can hang a page render
// for far longer than a normal request should — the caller's existing
// .catch(() => ...) fallbacks handle the resulting AbortError the same way
// they already handle any other rejection, so no call site needs to change.
const REQUEST_TIMEOUT_MS = 8000;

/** The full-library listing a sync pulls. The timeout covers reading the
 * body too, and a few thousand movies' JSON off a home server can take far
 * longer than 8s — this runs in the background, so it can afford to wait. */
export const LIBRARY_TIMEOUT_MS = 120_000;

async function radarrFetch<T>(
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
    throw new Error(`Radarr request failed: ${path} (${res.status})`);
  }

  // A delete answers with nothing to read (or an empty object).
  if (res.status === 204 || options.method === "DELETE") return undefined as T;
  return res.json() as Promise<T>;
}

export function testConnection(config: ArrConfig) {
  return radarrFetch<{ version: string }>(config, "/system/status");
}

export interface RadarrRootFolder {
  id: number;
  path: string;
  freeSpace?: number;
}

export function getRootFolders(config: ArrConfig) {
  return radarrFetch<RadarrRootFolder[]>(config, "/rootfolder");
}

export interface RadarrQualityProfile {
  id: number;
  name: string;
}

export function getQualityProfiles(config: ArrConfig) {
  return radarrFetch<RadarrQualityProfile[]>(config, "/qualityprofile");
}

export interface RadarrTag {
  id: number;
  label: string;
}

export function getTags(config: ArrConfig) {
  return radarrFetch<RadarrTag[]>(config, "/tag");
}

export interface RadarrMovieLookupResult {
  title: string;
  tmdbId: number;
  images: { coverType: string; url: string }[];
  year: number;
}

export function lookupByTmdbId(config: ArrConfig, tmdbId: number) {
  return radarrFetch<RadarrMovieLookupResult>(config, `/movie/lookup/tmdb?tmdbId=${tmdbId}`);
}

export interface RadarrMovie {
  id: number;
  tmdbId: number;
  title: string;
  /** The movie's page in Radarr is /movie/{titleSlug}. */
  titleSlug?: string;
  overview?: string;
  year?: number;
  status: string;
  /** Released as far as the movie's minimum availability goes. */
  isAvailable?: boolean;
  monitored: boolean;
  hasFile: boolean;
  path?: string;
  images?: { coverType: string; remoteUrl?: string; url?: string }[];
  movieFile?: {
    path: string;
    size: number;
    dateAdded?: string;
    releaseGroup?: string;
    edition?: string;
    quality: { quality: { name: string; resolution?: number; source?: string } };
    qualityCutoffNotMet?: boolean;
    // All of this rides along on the same /movie response already fetched
    // for status/quality — no extra Radarr call needed to show it.
    mediaInfo?: {
      resolution?: string;
      videoCodec?: string;
      videoDynamicRangeType?: string;
      audioCodec?: string;
      audioChannels?: number;
      runTime?: string;
    };
  };
}

export async function getMovieByTmdbId(config: ArrConfig, tmdbId: number): Promise<RadarrMovie | null> {
  const results = await radarrFetch<RadarrMovie[]>(config, `/movie?tmdbId=${tmdbId}`);
  return results[0] ?? null;
}

export function getAllMovies(config: ArrConfig): Promise<RadarrMovie[]> {
  return radarrFetch<RadarrMovie[]>(config, "/movie", { timeoutMs: LIBRARY_TIMEOUT_MS });
}

export async function setMovieMonitored(
  config: ArrConfig,
  movieId: number,
  monitored: boolean,
): Promise<void> {
  const movie = await radarrFetch<Record<string, unknown>>(config, `/movie/${movieId}`);
  await radarrFetch(config, `/movie/${movieId}`, {
    method: "PUT",
    body: { ...movie, monitored },
  });
}

/** Removes the movie from Radarr (the title page's "Remove from Radarr"),
 * and its files too when `deleteFiles`. Radarr won't re-add it from a list
 * import while it's excluded, so no exclusion is added. */
export async function deleteMovie(config: ArrConfig, movieId: number, deleteFiles: boolean): Promise<void> {
  await radarrFetch(config, `/movie/${movieId}?deleteFiles=${deleteFiles}&addImportExclusion=false`, { method: "DELETE" });
}

/** Queues an immediate search for this movie, same as Radarr's own "Search
 * Monitored" button — fire-and-forget, Radarr runs it asynchronously and
 * there's nothing meaningful to poll for completion here. */
export async function searchMovie(config: ArrConfig, movieId: number): Promise<void> {
  await radarrFetch(config, "/command", {
    method: "POST",
    body: { name: "MoviesSearch", movieIds: [movieId] },
  });
}

/** One movie by Radarr's own id. */
export function getMovie(config: ArrConfig, movieId: number): Promise<RadarrMovie> {
  return radarrFetch<RadarrMovie>(config, `/movie/${movieId}`);
}

/** Has Radarr look in the movie's folder again, so a file moved there by
 * hand is picked up. Fire-and-forget: Radarr runs it in the background. */
export async function rescanMovie(config: ArrConfig, movieId: number): Promise<void> {
  await radarrFetch(config, "/command", { method: "POST", body: { name: "RescanMovie", movieId } });
}

/** The queue, one summary per movie (lib/integrations/arr-status-logic.ts).
 * Every record is in it, finished ones included: a title with any record has
 * had a release found for it. */
export async function getQueueSummaries(config: ArrConfig): Promise<Map<number, QueueSummary>> {
  const res = await radarrFetch<{ records: ({ movieId: number } & ArrQueueRecord)[] }>(
    config,
    "/queue?pageSize=1000",
  );
  return summarizeQueue(res.records, (r) => r.movieId);
}

export interface RadarrCalendarMovie extends RadarrMovie {
  inCinemas?: string;
  physicalRelease?: string;
  digitalRelease?: string;
}

/** Movies with a release date (cinema/physical/digital) falling in the given
 * window — the source of truth Radarr itself tracks, rather than
 * re-deriving release timing from TMDb. */
export function getCalendar(config: ArrConfig, start: Date, end: Date): Promise<RadarrCalendarMovie[]> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    unmonitored: "true",
  });
  return radarrFetch<RadarrCalendarMovie[]>(config, `/calendar?${params.toString()}`);
}

export function addMovie(
  config: ArrConfig,
  input: {
    lookupResult: RadarrMovieLookupResult;
    qualityProfileId: number;
    rootFolderPath: string;
    /** Tag ids; omitted keeps whatever the lookup result has (none). */
    tags?: readonly number[];
  },
) {
  return radarrFetch<RadarrMovie>(config, "/movie", {
    method: "POST",
    body: {
      ...input.lookupResult,
      qualityProfileId: input.qualityProfileId,
      rootFolderPath: input.rootFolderPath,
      ...(input.tags ? { tags: [...input.tags] } : {}),
      monitored: true,
      addOptions: { searchForMovie: true },
    },
  });
}
