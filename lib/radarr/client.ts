export type ArrConfig = { baseUrl: string; apiKey: string };

async function radarrFetch<T>(
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
    throw new Error(`Radarr request failed: ${path} (${res.status})`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function testConnection(config: ArrConfig) {
  return radarrFetch<{ version: string }>(config, "/system/status");
}

export interface RadarrRootFolder {
  id: number;
  path: string;
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
  overview?: string;
  year?: number;
  status: string;
  monitored: boolean;
  hasFile: boolean;
  path?: string;
  images?: { coverType: string; remoteUrl?: string; url?: string }[];
  movieFile?: {
    path: string;
    size: number;
    quality: { quality: { name: string } };
  };
}

export async function getMovieByTmdbId(config: ArrConfig, tmdbId: number): Promise<RadarrMovie | null> {
  const results = await radarrFetch<RadarrMovie[]>(config, `/movie?tmdbId=${tmdbId}`);
  return results[0] ?? null;
}

export function getAllMovies(config: ArrConfig): Promise<RadarrMovie[]> {
  return radarrFetch<RadarrMovie[]>(config, "/movie");
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

/** IDs of movies with an active entry in Radarr's download queue right now
 * — a real-time signal, unlike `hasFile`/`monitored` which only reflect the
 * last completed sync. Paged, but a single page comfortably covers any
 * realistic queue size for a self-hosted instance. */
export async function getQueuedMovieIds(config: ArrConfig): Promise<Set<number>> {
  const res = await radarrFetch<{ records: { movieId: number }[] }>(
    config,
    "/queue?pageSize=250",
  );
  return new Set(res.records.map((r) => r.movieId));
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
  },
) {
  return radarrFetch<RadarrMovie>(config, "/movie", {
    method: "POST",
    body: {
      ...input.lookupResult,
      qualityProfileId: input.qualityProfileId,
      rootFolderPath: input.rootFolderPath,
      monitored: true,
      addOptions: { searchForMovie: true },
    },
  });
}
