import "server-only";
import { getStoredDiscoverLocale, getTmdbAccessToken } from "@/lib/integrations/app-settings";
import { resolveDiscoverLocale, type DiscoverLocale } from "@/lib/discover/locale";
import { TmdbError, TmdbNotConfiguredError } from "@/lib/tmdb/errors";
import { trimTitleImages, type TmdbLogoImage, type TmdbTitleImages } from "@/lib/tmdb/logo";
import type { TmdbPersonExternalIds } from "@/lib/tmdb/entity-links";
import { getLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/locales";
import { imageLanguages, isoLanguage, tmdbContentLanguage } from "@/lib/tmdb/language";

/** Logos (lib/tmdb/logo.ts) in English or with no text at all. */
const TITLE_IMAGE_LANGUAGES = "en,null";

export { TmdbError, TmdbNotConfiguredError };

const TMDB_API_BASE = "https://api.themoviedb.org/3";

// A slow/unreachable TMDb hangs page renders far longer than a normal
// request should — matches the timeout Radarr/Sonarr/Plex/etc. already set.
const REQUEST_TIMEOUT_MS = 8000;

/** Whether any TMDb credential is available — the same check tmdbFetch makes
 * before every request, exposed so callers that swallow per-request errors
 * (the Discover shelves, search) can still tell "nothing configured" apart
 * from "TMDb returned nothing". */
export async function isTmdbConfigured(): Promise<boolean> {
  const savedToken = await getTmdbAccessToken();
  return Boolean(savedToken || process.env.TMDB_API_KEY);
}

async function tmdbFetch<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const savedToken = await getTmdbAccessToken();
  const apiKey = process.env.TMDB_API_KEY;
  if (!savedToken && !apiKey) {
    throw new TmdbNotConfiguredError();
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
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new TmdbError(`TMDb request failed: ${path} (${res.status})`, res.status);
  }

  return res.json() as Promise<T>;
}

/**
 * The language this request's viewer reads TMDb's words in ("es-ES"): their
 * Marquee language (lib/i18n/server.ts — the account's choice, else the
 * browser's or app's Accept-Language), with Spanish and French following
 * the household's Discover region. English (en-US) outside a request.
 *
 * Lists, search and anything shown straight from TMDb ask in this
 * language. What's cached in the database (a title's, person's or
 * studio's details) is always fetched in English; translations of those
 * live beside them (lib/tmdb/translations.ts).
 */
export async function viewerContentLanguage(): Promise<string> {
  try {
    return await contentLanguageFor(await getLocale());
  } catch {
    return "en-US";
  }
}

/** TMDb's `language` for one of Marquee's languages, in this household's
 * region. */
export async function contentLanguageFor(locale: Locale): Promise<string> {
  if (locale === "en") return "en-US";
  const { discoverRegion } = await getDiscoverLocale();
  return tmdbContentLanguage(locale, discoverRegion);
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
  popularity?: number;
}

export interface TmdbSearchMultiResponse {
  page: number;
  results: TmdbSearchResult[];
  total_pages: number;
  total_results: number;
}

export async function searchMulti(query: string, page = 1) {
  return tmdbFetch<TmdbSearchMultiResponse>("/search/multi", {
    query,
    page,
    include_adult: "false",
    language: await viewerContentLanguage(),
  });
}

export interface TmdbTitleSearchResult {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path: string | null;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
}

export interface TmdbPersonSearchResult {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department?: string;
  popularity?: number;
  known_for?: { media_type?: string; title?: string; name?: string }[];
}

export type TmdbPagedSearch<T> = { page: number; results: T[]; total_pages: number; total_results: number };

/** One kind of result at a time, for the search page's sections and their
 * "See all" lists (search/multi mixes them and can't be paged per kind). */
export async function searchMovies(query: string, page = 1) {
  return tmdbFetch<TmdbPagedSearch<TmdbTitleSearchResult>>("/search/movie", {
    query,
    page,
    include_adult: "false",
    language: await viewerContentLanguage(),
  });
}

export async function searchTv(query: string, page = 1) {
  return tmdbFetch<TmdbPagedSearch<TmdbTitleSearchResult>>("/search/tv", {
    query,
    page,
    include_adult: "false",
    language: await viewerContentLanguage(),
  });
}

export async function searchPeople(query: string, page = 1) {
  return tmdbFetch<TmdbPagedSearch<TmdbPersonSearchResult>>("/search/person", {
    query,
    page,
    include_adult: "false",
    language: await viewerContentLanguage(),
  });
}

export interface TmdbCompanySearchResult {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

export function searchCompany(query: string, page = 1) {
  return tmdbFetch<{ results: TmdbCompanySearchResult[]; total_pages: number; total_results?: number }>(
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
  known_for_department?: string | null;
  homepage?: string | null;
  /** From append_to_response=external_ids (lib/tmdb/entity-links.ts). */
  external_ids?: TmdbPersonExternalIds;
}

export function getPersonDetails(id: number) {
  return tmdbFetch<TmdbPersonDetails>(`/person/${id}`, { append_to_response: "external_ids" });
}

/** A person's biography and credits in a language (the English ones are
 * cached — lib/tmdb/cache.ts), for laying over the English page. */
export function getLocalizedPerson(id: number, language: string) {
  return tmdbFetch<{ biography: string; combined_credits?: TmdbCombinedCredits }>(`/person/${id}`, {
    language,
    append_to_response: "combined_credits",
  });
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
  backdrop_path?: string | null;
  vote_count?: number;
  genre_ids?: number[];
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
  homepage?: string | null;
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
  vote_count?: number;
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

/** English unless a `language` is given: a Discover row's saved name is
 * the admin's; the Discover page's genre tiles are the viewer's. */
export function getMovieGenres(language?: string) {
  return tmdbFetch<{ genres: TmdbGenre[] }>("/genre/movie/list", { language });
}

export function getTvGenres(language?: string) {
  return tmdbFetch<{ genres: TmdbGenre[] }>("/genre/tv/list", { language });
}

export async function discoverMoviesByKeyword(keywordId: number, page = 1) {
  return tmdbFetch<TmdbDiscoverResponse>("/discover/movie", {
    language: await viewerContentLanguage(),
    with_keywords: keywordId,
    page,
    sort_by: "popularity.desc",
  });
}

export async function discoverTvByKeyword(keywordId: number, page = 1) {
  return tmdbFetch<TmdbDiscoverResponse>("/discover/tv", {
    language: await viewerContentLanguage(),
    with_keywords: keywordId,
    page,
    sort_by: "popularity.desc",
  });
}

export type DiscoverSort = "popularity" | "top_rated" | "newest";

/** Settings › Discover › Region & language (lib/discover/locale.ts): the
 * region and original language Popular/Upcoming and the Movies/Series
 * grids are for, and the country "Currently streaming on" is for. Read
 * fresh each call (cached 30s underneath). */
export async function getDiscoverLocale(): Promise<DiscoverLocale> {
  return resolveDiscoverLocale(
    await getStoredDiscoverLocale().catch(() => ({ streamingRegion: null, discoverRegion: null, discoverLanguage: null })),
  );
}

/** TMDb's `region` / `with_original_language` for a discover call. */
function discoverParams(locale: DiscoverLocale): { region?: string; with_original_language?: string } {
  return {
    region: locale.discoverRegion ?? undefined,
    with_original_language: locale.discoverLanguage ?? undefined,
  };
}

export async function discoverMovies(options: {
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
    language: await viewerContentLanguage(),
    with_genres: options.genreId,
    ...discoverParams(await getDiscoverLocale()),
    sort_by: sortBy,
    page: options.page ?? 1,
    primary_release_year: options.year,
    ...(options.sort === "top_rated" ? { "vote_count.gte": 200 } : {}),
  });
}

export async function discoverTv(options: {
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

  // TMDb's /discover/tv has no region parameter.
  const { with_original_language } = discoverParams(await getDiscoverLocale());
  return tmdbFetch<TmdbDiscoverResponse>("/discover/tv", {
    language: await viewerContentLanguage(),
    with_genres: options.genreId,
    with_networks: options.networkId,
    with_original_language,
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

/** One of a movie's release dates in one country (release_dates append).
 * `type`: 1 premiere, 2 theatrical (limited), 3 theatrical, 4 digital,
 * 5 physical, 6 TV. */
export interface TmdbReleaseDate {
  type: number;
  release_date: string;
  /** That release's rating there ("PG-13", "12"), often blank. */
  certification?: string;
}

export interface TmdbReleaseDates {
  results?: { iso_3166_1: string; release_dates: TmdbReleaseDate[] }[];
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
  original_title?: string;
  /** US dollars; 0 when TMDb doesn't know. */
  budget?: number;
  revenue?: number;
  keywords?: { keywords: TmdbKeywordRef[] };
  "watch/providers"?: TmdbWatchProviders;
  release_dates?: TmdbReleaseDates;
  /** Trimmed to the one logo the title page shows (lib/tmdb/logo.ts). */
  images?: TmdbTitleImages;
}

export function getMovieDetails(id: number) {
  return tmdbFetch<TmdbMovieDetails>(`/movie/${id}`, {
    append_to_response: "videos,external_ids,credits,recommendations,keywords,watch/providers,release_dates,images",
    include_image_language: TITLE_IMAGE_LANGUAGES,
  }).then(trimTitleImages);
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
export async function getCollection(id: number) {
  return tmdbFetch<TmdbCollectionDetails>(`/collection/${id}`, { language: await viewerContentLanguage() });
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
  original_name?: string;
  origin_country?: string[];
  keywords?: { results: TmdbKeywordRef[] };
  "watch/providers"?: TmdbWatchProviders;
  /** Trimmed to the one logo the title page shows (lib/tmdb/logo.ts). */
  images?: TmdbTitleImages;
  /** Each country's rating ("TV-MA"), for the blocklist's certification rules. */
  content_ratings?: { results?: { iso_3166_1: string; rating: string }[] };
  adult?: boolean;
}

export function getTvDetails(id: number) {
  return tmdbFetch<TmdbTvDetails>(`/tv/${id}`, {
    append_to_response: "videos,external_ids,credits,recommendations,keywords,watch/providers,images,content_ratings",
    include_image_language: TITLE_IMAGE_LANGUAGES,
  }).then(trimTitleImages);
}

/** A movie's or show's words and artwork in one language — laid over the
 * cached English details (lib/tmdb/translations.ts), so only what TMDb
 * translates is asked for: name, overview, tagline, genres, season names,
 * poster, the logo and a trailer in that language, and the similar titles'
 * names. */
export interface TmdbLocalizedDetails {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  tagline?: string | null;
  poster_path?: string | null;
  genres?: TmdbGenre[];
  seasons?: { season_number: number; name: string }[];
  images?: { logos?: TmdbLogoImage[] };
  videos?: { results: (TmdbVideo & { iso_639_1?: string })[] };
  recommendations?: { results: TmdbRecommendationItem[] };
}

export function getLocalizedTitleDetails(mediaType: "movie" | "tv", id: number, language: string) {
  return tmdbFetch<TmdbLocalizedDetails>(`/${mediaType}/${id}`, {
    language,
    append_to_response: "images,videos,recommendations",
    include_image_language: imageLanguages(language),
    // Only its own language's trailers: an English one is already cached.
    include_video_language: isoLanguage(language),
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

export async function getTrendingAll(page = 1) {
  return tmdbFetch<{ results: TmdbTrendingResult[]; total_pages?: number; total_results?: number }>("/trending/all/week", {
    page,
    language: await viewerContentLanguage(),
  });
}

export interface TmdbUpcomingResult {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
}

/** Upcoming in the Discover region (Settings › Discover), else the US —
 * TMDb's answer without a region is every country's mixed together. */
export async function getUpcomingMovies(page = 1) {
  const locale = await getDiscoverLocale();
  return tmdbFetch<{ results: TmdbUpcomingResult[]; total_pages?: number; total_results?: number }>("/movie/upcoming", {
    page,
    region: locale.discoverRegion ?? "US",
    language: await viewerContentLanguage(),
  });
}

/** TMDb has no dedicated "upcoming" TV endpoint (only on_the_air/
 * airing_today, which are about currently-airing episodes, not unreleased
 * series) — so this filters /discover/tv to future first-air dates instead,
 * for the same reason getUpcomingMovies' callers already re-filter
 * /movie/upcoming rather than trust it as-is. */
export async function getUpcomingTv(page = 1) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const { with_original_language } = discoverParams(await getDiscoverLocale());
  return tmdbFetch<TmdbDiscoverResponse>("/discover/tv", {
    page,
    language: await viewerContentLanguage(),
    sort_by: "first_air_date.asc",
    "first_air_date.gte": todayStr,
    with_original_language,
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

export function getKeywordDetails(id: number) {
  return tmdbFetch<TmdbKeyword>(`/keyword/${id}`);
}

/** A custom Discover row's titles (lib/discover/custom-shelves.ts): one
 * TMDb keyword, genre, company or network, most popular first, any
 * language (an "anime" row is mostly Japanese). */
export async function discoverForShelf(
  mediaType: "movie" | "tv",
  filter: { keywordId?: number; genreId?: number; companyId?: number; networkId?: number },
  page = 1,
) {
  return tmdbFetch<TmdbDiscoverResponse>(`/discover/${mediaType}`, {
    language: await viewerContentLanguage(),
    with_keywords: filter.keywordId,
    with_genres: filter.genreId,
    with_companies: filter.companyId,
    with_networks: mediaType === "tv" ? filter.networkId : undefined,
    sort_by: "popularity.desc",
    include_adult: "false",
    page,
  });
}

export interface TmdbListItem {
  id: number;
  media_type: "movie" | "tv" | string;
  title?: string;
  name?: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
}

export interface TmdbListDetails {
  id: number | string;
  name: string;
  page: number;
  total_pages: number;
  total_results: number;
  items: TmdbListItem[];
}

/** A public TMDb list, 20 items a page. Its name is its maker's; the
 * titles in it are in the viewer's language. */
export async function getTmdbList(id: number, page = 1) {
  return tmdbFetch<TmdbListDetails>(`/list/${id}`, { page, language: await viewerContentLanguage() });
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

/** English unless a `language` is given (lib/titles/season-episodes.ts
 * asks for both and fills gaps in one from the other). */
export function getTvSeasonDetails(tvId: number, seasonNumber: number, language?: string) {
  return tmdbFetch<{ episodes: TmdbEpisode[] }>(`/tv/${tvId}/season/${seasonNumber}`, { language });
}
