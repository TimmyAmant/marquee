// Discover's list shelves and where each shelf's "See all" goes — pure and
// dependency-free so it can be unit tested. Shared by app/discover (the
// website), GET /api/v1/discover (its `seeAll` map) and
// GET /api/v1/discover/lists/{list}.

import { TMDB_MAX_PAGE } from "@/lib/discover/paging";

/** The shelves with no browse page of their own: "See all" opens the whole
 * list as a paged grid (/discover/{list} on the website). */
export const DISCOVER_LISTS = ["recently-added", "trending", "upcoming-movies", "upcoming-series"] as const;

export type DiscoverList = (typeof DISCOVER_LISTS)[number];

export const DISCOVER_LIST_TITLES: Record<DiscoverList, string> = {
  "recently-added": "Recently Added",
  trending: "Trending",
  "upcoming-movies": "Upcoming Movies",
  "upcoming-series": "Upcoming Series",
};

export function parseDiscoverList(value: string | null | undefined): DiscoverList | null {
  return (DISCOVER_LISTS as readonly string[]).includes(value ?? "") ? (value as DiscoverList) : null;
}

/** The keys of GET /discover's shelves, in page order. */
export const DISCOVER_SHELF_KEYS = [
  "recentlyAdded",
  "trending",
  "popularMovies",
  "movieGenres",
  "upcomingMovies",
  "studios",
  "popularSeries",
  "seriesGenres",
  "upcomingSeries",
  "networks",
] as const;

export type DiscoverShelfKey = (typeof DISCOVER_SHELF_KEYS)[number];

/** Where a shelf's "See all" goes: a list (GET /discover/lists/{list}, the
 * website's /discover/{list}) or the Movies/Series grid (GET /movies|series,
 * the website's /movies and /series). Uniform shape so typed clients can
 * decode it into one struct. */
export type SeeAllTarget =
  | { type: "list"; list: DiscoverList; mediaType: null }
  | { type: "browse"; list: null; mediaType: "movie" | "tv" };

const list = (name: DiscoverList): SeeAllTarget => ({ type: "list", list: name, mediaType: null });
const browse = (mediaType: "movie" | "tv"): SeeAllTarget => ({ type: "browse", list: null, mediaType });

/** Every Discover shelf has a "See all". Popular Movies/Series, the genre
 * tiles and the studio/network logos open the full Movies or Series
 * catalog; the rest open their own list. */
export const DISCOVER_SEE_ALL: Record<DiscoverShelfKey, SeeAllTarget> = {
  recentlyAdded: list("recently-added"),
  trending: list("trending"),
  popularMovies: browse("movie"),
  movieGenres: browse("movie"),
  upcomingMovies: list("upcoming-movies"),
  studios: browse("movie"),
  popularSeries: browse("tv"),
  seriesGenres: browse("tv"),
  upcomingSeries: list("upcoming-series"),
  networks: browse("tv"),
};

/** The website page a "See all" opens. */
export function seeAllHref(target: SeeAllTarget): string {
  return target.type === "list" ? `/discover/${target.list}` : target.mediaType === "movie" ? "/movies" : "/series";
}

/** How many TMDb pages make up one page of a TMDb-backed list. */
export const LIST_TMDB_BATCH = 2;

/** One list page in Recently Added (a library query, not TMDb). */
export const RECENTLY_ADDED_PAGE_SIZE = 40;

/** Recently Added is sorted and limited in SQL per media server, so a page
 * deep into it re-reads everything before it — capped well short of that
 * getting expensive (1,000 titles). */
export const RECENTLY_ADDED_MAX_PAGE = 25;

/** The highest `page` the lists endpoint accepts. */
export function discoverListMaxPage(name: DiscoverList): number {
  return name === "recently-added" ? RECENTLY_ADDED_MAX_PAGE : Math.floor(TMDB_MAX_PAGE / LIST_TMDB_BATCH);
}

/** The TMDb pages behind list page `page` (1-based). */
export function listTmdbPages(page: number): number[] {
  const start = (page - 1) * LIST_TMDB_BATCH + 1;
  return Array.from({ length: LIST_TMDB_BATCH }, (_, i) => start + i).filter((p) => p <= TMDB_MAX_PAGE);
}

/** Total list pages for a TMDb list whose largest total_pages is `tmdbTotalPages`. */
export function listTotalPages(tmdbTotalPages: number): number {
  const capped = Math.min(Math.max(1, tmdbTotalPages), TMDB_MAX_PAGE);
  return Math.max(1, Math.ceil(capped / LIST_TMDB_BATCH));
}

/** Recently Added's paging: the caller fetches the newest
 * `page * RECENTLY_ADDED_PAGE_SIZE + 1` titles (one extra, to learn whether
 * another page exists) and this slices out the page. The totals only look
 * one page ahead: there's no count query behind them. */
export function sliceRecentlyAdded<T>(
  newest: T[],
  page: number,
): { items: T[]; totalPages: number; totalResults: number } {
  const start = (page - 1) * RECENTLY_ADDED_PAGE_SIZE;
  const end = page * RECENTLY_ADDED_PAGE_SIZE;
  const hasMore = newest.length > end && page < RECENTLY_ADDED_MAX_PAGE;
  const known = Math.min(newest.length, end);
  return {
    items: newest.slice(start, end),
    totalPages: hasMore ? page + 1 : Math.max(1, Math.min(page, Math.ceil(known / RECENTLY_ADDED_PAGE_SIZE))),
    totalResults: known + (hasMore ? 1 : 0),
  };
}
