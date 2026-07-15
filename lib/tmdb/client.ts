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
  const bearerToken = process.env.TMDB_ACCESS_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;
  if (!bearerToken && !apiKey) {
    throw new Error("Set TMDB_ACCESS_TOKEN (v4) or TMDB_API_KEY (v3) in the environment");
  }

  const url = new URL(`${TMDB_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  if (!bearerToken && apiKey) {
    url.searchParams.set("api_key", apiKey);
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

export type TmdbImageSize = "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "original";

export function tmdbImageUrl(
  path: string | null | undefined,
  size: TmdbImageSize = "w500",
): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
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
}) {
  const sortBy =
    options.sort === "top_rated"
      ? "vote_average.desc"
      : options.sort === "newest"
        ? "first_air_date.desc"
        : "popularity.desc";

  return tmdbFetch<TmdbDiscoverResponse>("/discover/tv", {
    with_genres: options.genreId,
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
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  status: string;
  imdb_id: string | null;
  videos?: { results: TmdbVideo[] };
  external_ids?: TmdbMovieExternalIds;
  credits?: { cast: TmdbCastMember[] };
  recommendations?: { results: TmdbRecommendationItem[] };
  production_companies?: TmdbCompanyRef[];
}

export function getMovieDetails(id: number) {
  return tmdbFetch<TmdbMovieDetails>(`/movie/${id}`, {
    append_to_response: "videos,external_ids,credits,recommendations",
  });
}

export interface TmdbTvDetails {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  status: string;
  seasons?: TmdbSeasonSummary[];
  videos?: { results: TmdbVideo[] };
  external_ids?: TmdbTvExternalIds;
  credits?: { cast: TmdbCastMember[] };
  recommendations?: { results: TmdbRecommendationItem[] };
  production_companies?: TmdbCompanyRef[];
  networks?: TmdbCompanyRef[];
}

export function getTvDetails(id: number) {
  return tmdbFetch<TmdbTvDetails>(`/tv/${id}`, {
    append_to_response: "videos,external_ids,credits,recommendations",
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
