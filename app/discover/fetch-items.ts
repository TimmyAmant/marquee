import {
  discoverMovies,
  discoverTv,
  getMovieGenres,
  getTvGenres,
  type DiscoverSort,
} from "@/lib/tmdb/client";
import { getLibraryStatusMap } from "@/lib/library/query";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { getFavoritedTmdbIds } from "@/lib/favorites/query";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import type { LibraryStatus } from "@/components/status-badge";
import type { MediaType } from "@/lib/db/schema";
import { discoverBatchSize, discoverTotalPages, TMDB_MAX_PAGE } from "@/lib/discover/paging";

export type DiscoverFetchParams = {
  lockedType: MediaType;
  sort: DiscoverSort;
  genreId?: number;
  year?: number;
  networkId?: number;
  hideOwned: boolean;
  page: number;
};

export type DiscoverCardData = {
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  year: string | null;
  meta: string | null;
  rating: number | null;
  overview: string | null;
  status?: LibraryStatus;
  favorited: boolean;
  canQuickAdd: boolean;
};


/**
 * One "page" of Movies/Series results, fully enriched (status, favorited,
 * quick-add eligibility) — shared by the initial server-rendered load
 * (discover-view.tsx), every subsequent infinite-scroll load (the
 * loadMoreDiscoverItems server action), and GET /api/v1/movies|series, so all
 * take the exact same path through TMDb, library-status, and favorites lookups.
 */
export async function fetchDiscoverItems(
  params: DiscoverFetchParams,
  viewer: ViewerIdentity,
): Promise<{ items: DiscoverCardData[]; hasNextPage: boolean; totalPages: number; totalResults: number }> {
  const { lockedType, sort, genreId, year, networkId, hideOwned, page } = params;

  const genres = await (lockedType === "movie" ? getMovieGenres() : getTvGenres()).catch(() => ({
    genres: [],
  }));
  const genreMap = new Map(genres.genres.map((g) => [g.id, g.name]));

  const BATCH_SIZE = discoverBatchSize(hideOwned);
  const startTmdbPage = (page - 1) * BATCH_SIZE + 1;
  const tmdbPages = Array.from({ length: BATCH_SIZE }, (_, i) => startTmdbPage + i);
  const emptyResponse = { results: [], total_pages: 1, total_results: 0 };

  const responses = await Promise.all(
    tmdbPages.map((p) =>
      (lockedType === "movie"
        ? discoverMovies({ genreId, sort, page: p, year })
        : discoverTv({ genreId, sort, page: p, year, networkId })
      ).catch(() => emptyResponse),
    ),
  );

  // TMDb's popularity ranking shifts between calls, so the same title can
  // land on two of these pages at once even though they're fetched together
  // — dedupe by id before anything downstream sees them.
  const seenIds = new Set<number>();
  const rawItems = responses
    .flatMap((r) => r.results)
    .filter((item) => {
      if (seenIds.has(item.id)) return false;
      seenIds.add(item.id);
      return true;
    })
    .map((item) => ({
      tmdbId: item.id,
      mediaType: lockedType,
      name: item.title || item.name || "",
      posterPath: item.poster_path,
      year: (item.release_date || item.first_air_date || "").slice(0, 4) || null,
      overview: item.overview || null,
      rating: item.vote_average ?? null,
      genreId: item.genre_ids?.[0] ?? null,
    }));

  const maxTotalPages = Math.max(1, ...responses.map((r) => r.total_pages));
  const hasNextPage = tmdbPages[tmdbPages.length - 1] < Math.min(maxTotalPages, TMDB_MAX_PAGE);
  const totalResults = Math.max(0, ...responses.map((r) => r.total_results));

  const statusMap = viewer.libraryOwnerId
    ? await getLibraryStatusMap(
        viewer.libraryOwnerId,
        rawItems.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId })),
      )
    : new Map<string, LibraryStatus>();

  const filtered = hideOwned
    ? rawItems.filter((i) => !statusMap.has(`${i.mediaType}:${i.tmdbId}`))
    : rawItems;

  const [radarrCredential, sonarrCredential, favoritedIds] = viewer.userId
    ? await Promise.all([
        getArrCredential(viewer.userId, "radarr"),
        getArrCredential(viewer.userId, "sonarr"),
        getFavoritedTmdbIds(
          viewer.userId,
          lockedType,
          filtered.map((i) => i.tmdbId),
        ),
      ])
    : [null, null, new Set<number>()];

  const arrConfigured =
    lockedType === "movie" ? isArrFullyConfigured(radarrCredential) : isArrFullyConfigured(sonarrCredential);

  const items: DiscoverCardData[] = filtered.map((item) => {
    const status = statusMap.get(`${item.mediaType}:${item.tmdbId}`);
    return {
      mediaType: item.mediaType,
      tmdbId: item.tmdbId,
      name: item.name,
      posterPath: item.posterPath,
      year: item.year,
      meta: item.genreId ? (genreMap.get(item.genreId) ?? null) : null,
      rating: item.rating,
      overview: item.overview,
      status,
      favorited: favoritedIds.has(item.tmdbId),
      canQuickAdd: Boolean(viewer.userId) && arrConfigured && !status,
    };
  });

  return {
    items,
    hasNextPage,
    totalPages: discoverTotalPages(maxTotalPages, hideOwned),
    totalResults,
  };
}
