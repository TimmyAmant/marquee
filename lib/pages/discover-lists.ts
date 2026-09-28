import { getTrendingAll, getUpcomingMovies, getUpcomingTv } from "@/lib/tmdb/client";
import { isUnwanted } from "@/lib/library/status-tone";
import { getEpisodeCountMap, getLibraryStatusMap, getRecentlyAdded } from "@/lib/library/query";
import type { EpisodeCounts } from "@/lib/library/episode-counts";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { getFavoritedTmdbIds } from "@/lib/favorites/query";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import type { LibraryStatus } from "@/components/status-badge";
import type { MediaType } from "@/lib/db/schema";
import type { DiscoverCardData } from "@/app/discover/fetch-items";
import {
  DISCOVER_LIST_TITLES,
  RECENTLY_ADDED_PAGE_SIZE,
  listTmdbPages,
  listTotalPages,
  sliceRecentlyAdded,
  discoverListMaxPage,
  parseDiscoverList,
  type DiscoverList,
} from "@/lib/discover/lists";
import { getCustomShelf } from "@/lib/discover/layout";
import { customShelfMaxPage, fetchCustomShelfPage } from "@/lib/discover/custom-shelves";
import type { LayoutShelf } from "@/lib/discover/shelves";
import { getT } from "@/lib/i18n/server";
import { WATCHLIST_PAGE_SIZE, getWatchlistShelfItems } from "@/lib/plex/watchlist-shelf";

// A Discover shelf's full list — "See all" on Recently Added, Trending,
// Upcoming Movies and Upcoming Series. Shared by app/discover/[list] (first
// page server-rendered, the rest via the loadMoreDiscoverList action) and
// GET /api/v1/discover/lists/{list}.

type RawItem = {
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  year: string | null;
  status?: LibraryStatus;
};

export type DiscoverListPage = {
  /** A built-in list's name, or a custom row's id. */
  list: string;
  title: string;
  page: number;
  totalPages: number;
  totalResults: number;
  items: DiscoverCardData[];
};

const yearOf = (date: string | undefined | null) => (date || "").slice(0, 4) || null;

/** A "See all" target: a built-in list ("trending") or one of the admin's
 * own rows (its id, Settings → Discover). Null when it's neither. */
export type ResolvedDiscoverList =
  | { type: "builtIn"; list: DiscoverList; maxPage: number }
  | { type: "custom"; shelf: LayoutShelf; maxPage: number };

export async function resolveDiscoverList(name: string): Promise<ResolvedDiscoverList | null> {
  const list = parseDiscoverList(name);
  if (list) return { type: "builtIn", list, maxPage: discoverListMaxPage(list) };
  const shelf = await getCustomShelf(name).catch(() => null);
  return shelf ? { type: "custom", shelf, maxPage: customShelfMaxPage(shelf.kind) } : null;
}

/** Drops repeats: TMDb's rankings shift between the pages of one batch. */
function dedupe(items: RawItem[]): RawItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.mediaType}:${item.tmdbId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function tmdbPage(list: Exclude<DiscoverList, "recently-added" | "watchlist">, page: number) {
  const pages = listTmdbPages(page);
  const empty = { results: [], total_pages: 0, total_results: 0 };

  if (list === "trending") {
    const responses = await Promise.all(pages.map((p) => getTrendingAll(p).catch(() => empty)));
    return {
      responses,
      items: responses
        .flatMap((r) => r.results)
        .filter((item) => item.media_type === "movie" || item.media_type === "tv")
        .map((item) => ({
          mediaType: item.media_type as MediaType,
          tmdbId: item.id,
          name: item.title || item.name || "",
          posterPath: item.poster_path,
          year: yearOf(item.release_date || item.first_air_date),
        })),
    };
  }

  if (list === "upcoming-movies") {
    // Same re-filter as the shelf (lib/pages/discover.ts): /movie/upcoming
    // also carries re-releases of films that came out years ago.
    const today = new Date().toISOString().slice(0, 10);
    const responses = await Promise.all(pages.map((p) => getUpcomingMovies(p).catch(() => empty)));
    return {
      responses,
      items: responses
        .flatMap((r) => r.results)
        .filter((item) => item.release_date && item.release_date >= today)
        .map((item) => ({
          mediaType: "movie" as MediaType,
          tmdbId: item.id,
          name: item.title,
          posterPath: item.poster_path,
          year: yearOf(item.release_date),
        })),
    };
  }

  const responses = await Promise.all(pages.map((p) => getUpcomingTv(p).catch(() => empty)));
  return {
    responses,
    items: responses
      .flatMap((r) => r.results)
      .map((item) => ({
        mediaType: "tv" as MediaType,
        tmdbId: item.id,
        name: item.name || item.title || "",
        posterPath: item.poster_path,
        year: yearOf(item.first_air_date),
      })),
  };
}

/** Library status, favorites and quick-add eligibility, the way the
 * Movies/Series grid (app/discover/fetch-items.ts) fills them in. */
async function enrich(viewer: ViewerIdentity, raw: RawItem[], knownStatus: boolean): Promise<DiscoverCardData[]> {
  const refs = raw.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId }));
  const [statusMap, episodeCounts] = await Promise.all([
    !knownStatus && viewer.libraryOwnerId
      ? getLibraryStatusMap(viewer.libraryOwnerId, refs)
      : new Map<string, LibraryStatus>(),
    viewer.libraryOwnerId ? getEpisodeCountMap(viewer.libraryOwnerId, refs) : new Map<string, EpisodeCounts>(),
  ]);

  const idsOf = (type: MediaType) => raw.filter((i) => i.mediaType === type).map((i) => i.tmdbId);
  const [radarr, sonarr, favoritedMovies, favoritedTv] = viewer.userId
    ? await Promise.all([
        getArrCredential(viewer.userId, "radarr"),
        getArrCredential(viewer.userId, "sonarr"),
        getFavoritedTmdbIds(viewer.userId, "movie", idsOf("movie")),
        getFavoritedTmdbIds(viewer.userId, "tv", idsOf("tv")),
      ])
    : [null, null, new Set<number>(), new Set<number>()];
  const arrConfigured = { movie: isArrFullyConfigured(radarr), tv: isArrFullyConfigured(sonarr) };

  return raw.map((item) => {
    const status = knownStatus ? item.status : statusMap.get(`${item.mediaType}:${item.tmdbId}`);
    const favorited = (item.mediaType === "movie" ? favoritedMovies : favoritedTv).has(item.tmdbId);
    return {
      mediaType: item.mediaType,
      tmdbId: item.tmdbId,
      name: item.name,
      posterPath: item.posterPath,
      year: item.year,
      meta: null,
      rating: null,
      overview: null,
      status,
      episodes: episodeCounts.get(`${item.mediaType}:${item.tmdbId}`) ?? null,
      favorited,
      canQuickAdd: Boolean(viewer.userId) && arrConfigured[item.mediaType] && isUnwanted(status),
    };
  });
}

/** One page of a custom row's See all (lib/discover/custom-shelves.ts). */
export async function fetchCustomShelfListPage(
  shelf: LayoutShelf,
  page: number,
  viewer: ViewerIdentity,
): Promise<DiscoverListPage> {
  const result = await fetchCustomShelfPage(shelf, page, viewer);
  // Recently added knows each title's status already.
  const knownStatus = shelf.kind === "library";
  const items = await enrich(viewer, dedupe(result.items), knownStatus);
  return {
    list: shelf.id,
    title: shelf.title,
    page,
    totalPages: result.totalPages,
    totalResults: result.totalResults,
    items,
  };
}

/** Either kind of See all, by what resolveDiscoverList found. */
export function fetchResolvedListPage(
  resolved: ResolvedDiscoverList,
  page: number,
  viewer: ViewerIdentity,
): Promise<DiscoverListPage> {
  return resolved.type === "builtIn"
    ? fetchDiscoverListPage(resolved.list, page, viewer)
    : fetchCustomShelfListPage(resolved.shelf, page, viewer);
}

export async function fetchDiscoverListPage(
  list: DiscoverList,
  page: number,
  viewer: ViewerIdentity,
): Promise<DiscoverListPage> {
  const title = (await getT())(DISCOVER_LIST_TITLES[list]);

  if (list === "recently-added") {
    const newest = viewer.libraryOwnerId
      ? await getRecentlyAdded(viewer.libraryOwnerId, page * RECENTLY_ADDED_PAGE_SIZE + 1)
      : [];
    const slice = sliceRecentlyAdded(newest, page);
    const items = await enrich(
      viewer,
      slice.items.map((item) => ({ ...item, status: item.status ?? undefined })),
      true,
    );
    return { list, title, page, totalPages: slice.totalPages, totalResults: slice.totalResults, items };
  }

  if (list === "watchlist") {
    // The viewer's own (lib/plex/watchlist-shelf.ts), one page plus one
    // to learn whether there's another — like Recently Added.
    const newest = await getWatchlistShelfItems(viewer, WATCHLIST_PAGE_SIZE + 1, (page - 1) * WATCHLIST_PAGE_SIZE);
    const hasMore = newest.length > WATCHLIST_PAGE_SIZE;
    const items = await enrich(viewer, newest.slice(0, WATCHLIST_PAGE_SIZE), true);
    return {
      list,
      title,
      page,
      totalPages: hasMore ? page + 1 : Math.max(1, page),
      totalResults: (page - 1) * WATCHLIST_PAGE_SIZE + items.length + (hasMore ? 1 : 0),
      items,
    };
  }

  const { responses, items: raw } = await tmdbPage(list, page);
  const maxTotalPages = Math.max(0, ...responses.map((r) => r.total_pages ?? 0));
  const totalResults = Math.max(0, ...responses.map((r) => r.total_results ?? 0));
  const items = await enrich(viewer, dedupe(raw), false);
  return { list, title, page, totalPages: listTotalPages(maxTotalPages), totalResults, items };
}
