const TVDB_API_BASE = "https://api4.thetvdb.com/v4";
// TVDB's own token is valid ~1 month; refresh a bit early rather than
// racing its exact expiry.
const TOKEN_TTL_MS = 25 * 24 * 60 * 60 * 1000;
// See the matching constant in lib/radarr/client.ts — a slow/unreachable
// TheTVDB shouldn't be able to hang a page render indefinitely.
const REQUEST_TIMEOUT_MS = 8000;

let tokenCache: { apiKey: string; token: string; expiresAt: number } | null = null;

async function login(apiKey: string): Promise<string> {
  if (tokenCache && tokenCache.apiKey === apiKey && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const res = await fetch(`${TVDB_API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: apiKey }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`TheTVDB login failed (${res.status})`);

  const body = (await res.json()) as { data?: { token?: string } };
  const token = body.data?.token;
  if (!token) throw new Error("TheTVDB login response missing token");

  tokenCache = { apiKey, token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token;
}

async function doFetch<T>(path: string, token: string): Promise<{ res: Response; data?: T }> {
  const res = await fetch(`${TVDB_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return { res };
  const body = (await res.json()) as { data: T };
  return { res, data: body.data };
}

async function tvdbFetch<T>(apiKey: string, path: string): Promise<T> {
  const token = await login(apiKey);
  let { res, data } = await doFetch<T>(path, token);

  if (res.status === 401) {
    // Token may have been revoked/expired server-side before our own TTL
    // caught it — retry once with a fresh login rather than failing outright.
    tokenCache = null;
    const freshToken = await login(apiKey);
    ({ res, data } = await doFetch<T>(path, freshToken));
  }

  if (!res.ok) throw new Error(`TheTVDB request failed: ${path} (${res.status})`);
  return data as T;
}

export async function verifyTvdbApiKey(apiKey: string): Promise<boolean> {
  return login(apiKey)
    .then(() => true)
    .catch(() => false);
}

export interface TvdbGenre {
  id: number;
  name: string;
}

export interface TvdbCompany {
  id: number;
  name: string;
}

export interface TvdbStatus {
  id: number;
  name: string;
}

export interface TvdbSeriesExtended {
  id: number;
  name: string;
  image: string | null;
  year: string | null;
  score: number | null;
  status: TvdbStatus | null;
  genres: TvdbGenre[];
  originalNetwork: TvdbCompany | null;
  averageRuntime: number | null;
  originalLanguage: string | null;
  firstAired: string | null;
  lastAired: string | null;
  overviewTranslations?: string[];
}

export function getSeriesExtended(apiKey: string, tvdbId: number): Promise<TvdbSeriesExtended> {
  return tvdbFetch<TvdbSeriesExtended>(apiKey, `/series/${tvdbId}/extended?meta=translations`);
}

export interface TvdbMovieExtended {
  id: number;
  name: string;
  image: string | null;
  year: string | null;
  score: number | null;
  status: TvdbStatus | null;
  genres: TvdbGenre[];
  runtime: number | null;
  originalLanguage: string | null;
  overviewTranslations?: string[];
}

export function getMovieExtended(apiKey: string, tvdbId: number): Promise<TvdbMovieExtended> {
  return tvdbFetch<TvdbMovieExtended>(apiKey, `/movies/${tvdbId}/extended?meta=translations`);
}

/** TVDB's own overview data is just an unordered list of translation
 * strings, not language-tagged objects — best-effort take the first one
 * rather than pretending we can reliably pick "English" out of it. */
export function pickOverview(overviewTranslations: string[] | undefined): string | null {
  return overviewTranslations?.[0] || null;
}
