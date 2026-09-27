// OMDb (omdbapi.com): IMDb, Rotten Tomatoes and Metacritic scores for a
// title, looked up by IMDb id. Optional — only with a key saved in Settings
// › Integrations (lib/integrations/app-settings.ts getOmdbApiKey). The
// answer's parsing is pure (parseOmdbRatings) so it's unit tested without
// the network.

const OMDB_API_BASE = "https://www.omdbapi.com/";
// A slow OMDb shouldn't hold a title page: the ratings row is a nicety.
const REQUEST_TIMEOUT_MS = 6000;

/** What a title page shows beside TMDb's score; every part optional. */
export type TitleRatings = {
  /** 0–10, one decimal (8.2). */
  imdbRating: number | null;
  imdbVotes: number | null;
  /** The Tomatometer, 0–100. */
  rottenTomatoesCritics: number | null;
  /** The Metascore, 0–100. */
  metacritic: number | null;
};

export const EMPTY_RATINGS: TitleRatings = {
  imdbRating: null,
  imdbVotes: null,
  rottenTomatoesCritics: null,
  metacritic: null,
};

export function hasAnyRating(ratings: TitleRatings): boolean {
  return (
    ratings.imdbRating !== null ||
    ratings.rottenTomatoesCritics !== null ||
    ratings.metacritic !== null
  );
}

/** OMDb's answer, as far as this reads it. */
export type OmdbResponse = {
  Response?: "True" | "False" | string;
  Error?: string;
  imdbRating?: string;
  imdbVotes?: string;
  Metascore?: string;
  Ratings?: { Source?: string; Value?: string }[];
};

function number(value: string | undefined): number | null {
  if (!value || value === "N/A") return null;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function percent(value: string | undefined): number | null {
  const match = value?.match(/^(\d{1,3})%$/);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 0 && n <= 100 ? n : null;
}

/** "8.2" → 8.2; "N/A" or nonsense → null. Out of 0–10 is nonsense too. */
function tenScale(value: string | undefined): number | null {
  const n = number(value);
  return n !== null && n >= 0 && n <= 10 ? Math.round(n * 10) / 10 : null;
}

/** "70/100" (the Ratings list) or "70" (Metascore) → 70. */
function metascore(value: string | undefined): number | null {
  const match = value?.match(/^(\d{1,3})(?:\/100)?$/);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 0 && n <= 100 ? n : null;
}

/** Reads what OMDb answered for one title. `Response: "False"` (no such
 * title, or "Request limit reached!") reads as nothing known. */
export function parseOmdbRatings(body: OmdbResponse | null | undefined): TitleRatings {
  if (!body || body.Response === "False") return EMPTY_RATINGS;
  const sources = new Map((body.Ratings ?? []).map((r) => [r.Source ?? "", r.Value]));
  return {
    imdbRating: tenScale(body.imdbRating) ?? tenScale(sources.get("Internet Movie Database")?.split("/")[0]),
    imdbVotes: number(body.imdbVotes),
    rottenTomatoesCritics: percent(sources.get("Rotten Tomatoes")),
    metacritic: metascore(body.Metascore) ?? metascore(sources.get("Metacritic")),
  };
}

/** Thrown when OMDb refuses the key (401) — the settings test-and-save
 * tells the two apart from "no such title". */
export class OmdbKeyError extends Error {
  constructor() {
    super("OMDb rejected the API key");
    this.name = "OmdbKeyError";
  }
}

export async function fetchOmdbRatings(apiKey: string, imdbId: string): Promise<TitleRatings> {
  const url = new URL(OMDB_API_BASE);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("i", imdbId);
  url.searchParams.set("tomatoes", "true");
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 401) throw new OmdbKeyError();
  if (!res.ok) throw new Error(`OMDb request failed (${res.status})`);
  const body = (await res.json()) as OmdbResponse;
  if (body.Response === "False" && /invalid api key/i.test(body.Error ?? "")) throw new OmdbKeyError();
  return parseOmdbRatings(body);
}

/** Whether OMDb accepts the key: asks for a title everyone has (The Matrix). */
export async function verifyOmdbApiKey(apiKey: string): Promise<boolean> {
  try {
    await fetchOmdbRatings(apiKey, "tt0133093");
    return true;
  } catch (err) {
    if (err instanceof OmdbKeyError) return false;
    // Unreachable rather than refused: don't call a good key bad.
    throw err;
  }
}

export function imdbTitleUrl(imdbId: string): string {
  return `https://www.imdb.com/title/${imdbId}/`;
}
