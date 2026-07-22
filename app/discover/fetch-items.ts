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
import { getViewerContext } from "@/lib/integrations/library-owner";
import type { LibraryStatus } from "@/components/status-badge";
import type { MediaType } from "@/lib/db/schema";

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
 * (discover-view.tsx) and every subsequent infinite-scroll load (the
 * loadMoreDiscoverItems server action), so both take the exact same path
 * through TMDb, library-status, and favorites lookups.
 */
export async function fetchDiscoverItems(
  params: DiscoverFetchParams,
): Promise<{ items: DiscoverCardData[]; hasNextPage: boolean }> {
  const { lockedType, sort, genreId, year, networkId, hideOwned, page } = params;
  const viewer = await getViewerContext();

  const genres = await (lockedType === "movie" ? getMovieGenres() : getTvGenres()).catch(() => ({
    genres: [],
  }));
  const genreMap = new Map(genres.genres.map((g) => [g.id, g.name]));

  // Same batching/oversampling strategy the page has always used: several
  // TMDb pages per screen (not just one), and a much bigger batch
  // specifically when "hide titles you already track" is on, since that
  // filter can otherwise thin a batch down to almost nothing for an account
  // with a large synced library.
  const BATCH_SIZE = hideOwned ? 10 : 4;
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

  const rawItems = responses.flatMap((r) => r.results).map((item) => ({
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
  const hasNextPage = tmdbPages[tmdbPages.length - 1] < Math.min(maxTotalPages, 500);

  const statusMap = viewer.libraryOwnerId
    ? await getLibraryStatusMap(
        viewer.libraryOwnerId,
        rawItems.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId })),
      )
    : new Map<string, LibraryStatus>();

  const filtered = hideOwned
    ? rawItems.filter((i) => !statusMap.has(`${i.mediaType}:${i.tmdbId}`))
    : rawItems;

  const [radarrCredential, sonarrCredential, favoritedIds] = viewer.session
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
      canQuickAdd: Boolean(viewer.session) && arrConfigured && !status,
    };
  });

  return { items, hasNextPage };
}
