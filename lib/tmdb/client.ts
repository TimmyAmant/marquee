import "server-only";
import { getTmdbAccessToken } from "@/lib/integrations/app-settings";

const TMDB_API_BASE = "https://api.themoviedb.org/3";

export class TmdbError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

async function tmdbFetch<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const savedToken = await getTmdbAccessToken();
  const apiKey = process.env.TMDB_API_KEY;
  if (!savedToken && !apiKey) {
    throw new Error(
      "Set a TMDb access token in Settings, or TMDB_ACCESS_TOKEN/TMDB_API_KEY in the environment",
    );
  }

  // The saved-in-Settings slot accepts either TMDb credential shape (see
  // verifyTmdbAccessToken) — a v4 token (JWT, contains dots) goes as a Bearer
  // header, a v3 key (32-char hex) only works as an `?api_key=` param.
  const bearerToken = savedToken?.includes(".") ? savedToken : undefined;
  const queryApiKey = savedToken && !bearerToken ? savedToken : apiKey;

  const url = new URL(`${TMDB_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  if (!bearerToken && queryApiKey) {
    url.searchParams.set("api_key", queryApiKey);
  }

  const res = await fetch(url, {
    headers: {
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      Accept: "application/json",
    },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new TmdbError(`TMDb request failed: ${path} (${res.status})`, res.status);
  }

  return res.json() as Promise<T>;
}

/** Tests a credential directly (not the currently-configured one) against
 * TMDb's own auth-check endpoint, for the "test & save" flow in Settings.
 *
 * TMDb issues two different credential shapes and this field accepts either:
 * a v4 read access token (a JWT, contains dots) goes as an `Authorization:
 * Bearer` header, while a v3 API key (32-char hex, no dots) only works as an
 * `?api_key=` query param — sending a v3 key as a Bearer token always 401s. */
export async function verifyTmdbAccessToken(token: string): Promise<boolean> {
  const isV4Token = token.includes(".");
  const url = new URL(`${TMDB_API_BASE}/authentication`);
  if (!isV4Token) url.searchParams.set("api_key", token);

  const res = await fetch(url, {
    headers: {
      ...(isV4Token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: "application/json",
    },
  });
  return res.ok;
}

export interface TmdbSearchResult {
  id: number;
  media_type: "movie" | "tv" | "person";
  name?: string;
  title?: string;
  profile_path?: string | null;
  poster_path?: string | null;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  known_for_department?: string;
}

export interface TmdbSearchMultiResponse {
  page: number;
  results: TmdbSearchResult[];
  total_pages: number;
  total_results: number;
}

export function searchMulti(query: string, page = 1) {
  return tmdbFetch<TmdbSearchMultiResponse>("/search/multi", { query, page, include_adult: "false" });
}

export interface TmdbCompanySearchResult {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

export function searchCompany(query: string, page = 1) {
  return tmdbFetch<{ results: TmdbCompanySearchResult[]; total_pages: number }>(
    "/search/company",
    { query, page },
  );
}

export interface TmdbKeyword {
  id: number;
  name: string;
}

/** For search queries that describe a topic/theme rather than a title —
 * e.g. "natural disaster" — rather than a genre like "action". */
export function searchKeyword(query: string, page = 1) {
  return tmdbFetch<{ results: TmdbKeyword[]; total_pages: number }>("/search/keyword", {
    query,
    page,
  });
}

export interface TmdbPersonDetails {
  id: number;
  name: string;
  also_known_as: string[];
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
}

export function getPersonDetails(id: number) {
  return tmdbFetch<TmdbPersonDetails>(`/person/${id}`);
}

export interface TmdbCreditItem {
  id: number;
  media_type: "movie" | "tv";
  title?: string;
  name?: string;
  character?: string;
  department?: string;
  job?: string;
  episode_count?: number;
  order?: number;
  poster_path: string | null;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
}

export interface TmdbCombinedCredits {
  cast: TmdbCreditItem[];
  crew: TmdbCreditItem[];
}

export function getPersonCombinedCredits(id: number) {
  return tmdbFetch<TmdbCombinedCredits>(`/person/${id}/combined_credits`);
}

export interface TmdbCompanyDetails {
  id: number;
  name: string;
  description: string;
  logo_path: string | null;
  origin_country: string;
  parent_company: { id: number; name: string } | null;
}

export function getCompanyDetails(id: number) {
  return tmdbFetch<TmdbCompanyDetails>(`/company/${id}`);
}

export interface TmdbDiscoverResult {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
  vote_average?: number;
  genre_ids?: number[];
}

export interface TmdbDiscoverResponse {
  page: number;
  results: TmdbDiscoverResult[];
  total_pages: number;
  total_results: number;
}

export function discoverMoviesByCompany(companyId: number, page = 1) {
  return tmdbFetch<TmdbDiscoverResponse>("/discover/movie", {
    with_companies: companyId,
    page,
    sort_by: "primary_release_date.desc",
  });
}

export function discoverTvByCompany(companyId: number, page = 1) {
  return tmdbFetch<TmdbDiscoverResponse>("/discover/tv", {
    with_companies: companyId,
    page,
    sort_by: "first_air_date.desc",
  });
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export function getMovieGenres() {
  return tmdbFetch<{ genres: TmdbGenre[] }>("/genre/movie/list");
}

export function getTvGenres() {
  return tmdbFetch<{ genres: TmdbGenre[] }>("/genre/tv/list");
}

export function discoverMoviesByKeyword(keywordId: number, page = 1) {
  return tmdbFetch<TmdbDiscoverResponse>("/discover/movie", {
    with_keywords: keywordId,
    page,
    sort_by: "popularity.desc",
  });
}

export function discoverTvByKeyword(keywordId: number, page = 1) {
  return tmdbFetch<TmdbDiscoverResponse>("/discover/tv", {
    with_keywords: keywordId,
    page,
    sort_by: "popularity.desc",
  });
}

export type DiscoverSort = "popularity" | "top_rated" | "newest";

export function discoverMovies(options: {
  genreId?: number;
  sort: DiscoverSort;
  page?: number;
  year?: number;
}) {
  const sortBy =
    options.sort === "top_rated"
      ? "vote_average.desc"
      : options.sort === "newest"
        ? "primary_release_date.desc"
        : "popularity.desc";

  return tmdbFetch<TmdbDiscoverResponse>("/discover/movie", {
    with_genres: options.genreId,
    with_original_language: "en",
    sort_by: sortBy,
    page: options.page ?? 1,
    primary_release_year: options.year,
    ...(options.sort === "top_rated" ? { "vote_count.gte": 200 } : {}),
  });
}

export function discoverTv(options: {
  genreId?: number;
  sort: DiscoverSort;
  page?: number;
  year?: number;
  networkId?: number;
}) {
  const sortBy =
    options.sort === "top_rated"
      ? "vote_average.desc"
      : options.sort === "newest"
        ? "first_air_date.desc"
        : "popularity.desc";

  return tmdbFetch<TmdbDiscoverResponse>("/discover/tv", {
    with_genres: options.genreId,
    with_networks: options.networkId,
    with_original_language: "en",
    sort_by: sortBy,
    page: options.page ?? 1,
    first_air_date_year: options.year,
    ...(options.sort === "top_rated" ? { "vote_count.gte": 200 } : {}),
  });
}

export interface TmdbVideo {
  key: string;
  site: string;
  type: string;
  official: boolean;
}

export interface TmdbMovieExternalIds {
  imdb_id: string | null;
  facebook_id: string | null;
  instagram_id: string | null;
  twitter_id: string | null;
}

export interface TmdbTvExternalIds extends TmdbMovieExternalIds {
  tvdb_id: number | null;
}

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface TmdbCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface TmdbKeywordRef {
  id: number;
  name: string;
}

export interface TmdbWatchProviderEntry {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

export interface TmdbWatchProviders {
  results?: Record<string, { link?: string; flatrate?: TmdbWatchProviderEntry[] }>;
}

export interface TmdbProductionCountry {
  iso_3166_1: string;
  name: string;
}

export interface TmdbRecommendationItem {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
}

export interface TmdbSeasonSummary {
  season_number: number;
  name: string;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
}

export interface TmdbCompanyRef {
  id: number;
  name: string;
  logo_path: string | null;
}

export interface TmdbMovieDetails {
  id: number;
  title: string;
  overview: string;
  tagline?: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  status: string;
  imdb_id: string | null;
  videos?: { results: TmdbVideo[] };
  external_ids?: TmdbMovieExternalIds;
  credits?: { cast: TmdbCastMember[]; crew: TmdbCrewMember[] };
  recommendations?: { results: TmdbRecommendationItem[] };
  production_companies?: TmdbCompanyRef[];
  production_countries?: TmdbProductionCountry[];
  belongs_to_collection?: TmdbCollectionRef | null;
  runtime?: number | null;
  genres?: { id: number; name: string }[];
  vote_average?: number;
  original_language?: string;
  keywords?: { keywords: TmdbKeywordRef[] };
  "watch/providers"?: TmdbWatchProviders;
}

export function getMovieDetails(id: number) {
  return tmdbFetch<TmdbMovieDetails>(`/movie/${id}`, {
    append_to_response: "videos,external_ids,credits,recommendations,keywords,watch/providers",
  });
}

export interface TmdbCollectionRef {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

export interface TmdbCollectionPart {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
}

export interface TmdbCollectionDetails {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: TmdbCollectionPart[];
}

/** A movie franchise (Harry Potter, James Bond, etc.) — TMDb tracks these
 * natively via `belongs_to_collection` on a movie plus this endpoint, so no
 * manual curation is needed the way TV crossovers require. */
export function getCollection(id: number) {
  return tmdbFetch<TmdbCollectionDetails>(`/collection/${id}`);
}

export interface TmdbTvDetails {
  id: number;
  name: string;
  overview: string;
  tagline?: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  status: string;
  seasons?: TmdbSeasonSummary[];
  videos?: { results: TmdbVideo[] };
  external_ids?: TmdbTvExternalIds;
  credits?: { cast: TmdbCastMember[]; crew: TmdbCrewMember[] };
  recommendations?: { results: TmdbRecommendationItem[] };
  production_companies?: TmdbCompanyRef[];
  production_countries?: TmdbProductionCountry[];
  networks?: TmdbCompanyRef[];
  episode_run_time?: number[];
  last_air_date?: string;
  next_episode_to_air?: { air_date: string } | null;
  created_by?: { id: number; name: string }[];
  genres?: { id: number; name: string }[];
  vote_average?: number;
  original_language?: string;
  keywords?: { results: TmdbKeywordRef[] };
  "watch/providers"?: TmdbWatchProviders;
}

export function getTvDetails(id: number) {
  return tmdbFetch<TmdbTvDetails>(`/tv/${id}`, {
    append_to_response: "videos,external_ids,credits,recommendations,keywords,watch/providers",
  });
}

export function findTrailer(videos: { results: TmdbVideo[] } | undefined): TmdbVideo | null {
  if (!videos?.results?.length) return null;
  const trailers = videos.results.filter((v) => v.site === "YouTube" && v.type === "Trailer");
  return trailers.find((v) => v.official) ?? trailers[0] ?? null;
}

export interface TmdbTrendingResult {
  id: number;
  media_type: "movie" | "tv";
  title?: string;
  name?: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
}

export function getTrendingAll(page = 1) {
  return tmdbFetch<{ results: TmdbTrendingResult[] }>("/trending/all/week", { page });
}

export interface TmdbUpcomingResult {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
}

export function getUpcomingMovies(page = 1) {
  return tmdbFetch<{ results: TmdbUpcomingResult[] }>("/movie/upcoming", {
    page,
    region: "US",
  });
}

/** TMDb has no dedicated "upcoming" TV endpoint (only on_the_air/
 * airing_today, which are about currently-airing episodes, not unreleased
 * series) — so this filters /discover/tv to future first-air dates instead,
 * for the same reason getUpcomingMovies' callers already re-filter
 * /movie/upcoming rather than trust it as-is. */
export function getUpcomingTv(page = 1) {
  const todayStr = new Date().toISOString().slice(0, 10);
  return tmdbFetch<TmdbDiscoverResponse>("/discover/tv", {
    page,
    sort_by: "first_air_date.asc",
    "first_air_date.gte": todayStr,
    with_original_language: "en",
  });
}

export interface TmdbNetworkDetails {
  id: number;
  name: string;
  logo_path: string | null;
}

export function getNetworkDetails(id: number) {
  return tmdbFetch<TmdbNetworkDetails>(`/network/${id}`);
}

export interface TmdbFindResult {
  id: number;
  name: string;
  poster_path: string | null;
  first_air_date?: string;
}

export function findByTvdbId(tvdbId: number) {
  return tmdbFetch<{ tv_results: TmdbFindResult[] }>(`/find/${tvdbId}`, {
    external_source: "tvdb_id",
  });
}

export function findByImdbId(imdbId: string) {
  return tmdbFetch<{ movie_results: TmdbFindResult[]; tv_results: TmdbFindResult[] }>(
    `/find/${imdbId}`,
    { external_source: "imdb_id" },
  );
}

export interface TmdbEpisode {
  id: number;
  episode_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  still_path: string | null;
}

export function getTvSeasonDetails(tvId: number, seasonNumber: number) {
  return tmdbFetch<{ episodes: TmdbEpisode[] }>(`/tv/${tvId}/season/${seasonNumber}`);
}
