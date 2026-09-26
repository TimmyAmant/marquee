import {
  getTrendingAll,
  getUpcomingMovies,
  getUpcomingTv,
  discoverMovies,
  discoverTv,
  getMovieGenres,
  getTvGenres,
  getCompanyDetails,
  getNetworkDetails,
  type TmdbGenre,
} from "@/lib/tmdb/client";
import { CURATED_STUDIO_IDS, CURATED_NETWORK_IDS } from "@/lib/tmdb/curated-companies";
import { getLibraryStatusMap, getRecentlyAdded } from "@/lib/library/query";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import type { LibraryStatus } from "@/components/status-badge";
import type { MediaType } from "@/lib/db/schema";
import { getDiscoverLayout } from "@/lib/discover/layout";
import { fetchCustomShelfPage, type ShelfItem } from "@/lib/discover/custom-shelves";
import { defaultLayout } from "@/lib/discover/shelves";

/** Titles a row shows on Discover itself; the rest are on its See all. */
export const SHELF_LENGTH = 20;

async function fetchMovieGenreBackdrops(genres: TmdbGenre[]) {
  return Promise.all(
    genres.map((g) =>
      discoverMovies({ genreId: g.id, sort: "popularity", page: 1 })
        .then((r) => r.results[0]?.backdrop_path ?? null)
        .catch(() => null),
    ),
  );
}

async function fetchTvGenreBackdrops(genres: TmdbGenre[]) {
  return Promise.all(
    genres.map((g) =>
      discoverTv({ genreId: g.id, sort: "popularity", page: 1 })
        .then((r) => r.results[0]?.backdrop_path ?? null)
        .catch(() => null),
    ),
  );
}

/**
 * Everything the Discover landing page's shelves show — shared by
 * app/discover/page.tsx and GET /api/v1/discover. The rows come in the
 * admin's order (Settings → Discover, lib/discover/layout.ts); a hidden
 * built-in row isn't fetched and comes back empty. Each TMDb call fails soft
 * to an empty shelf, exactly like the page.
 */
export async function loadDiscoverShelves(viewer: ViewerIdentity) {
  const layout = await getDiscoverLayout().catch((err) => {
    console.error("[discover] couldn't read the Discover layout; showing the default:", err);
    return defaultLayout();
  });
  const visible = layout.filter((shelf) => !shelf.hidden);
  const shows = new Set(visible.map((shelf) => shelf.id));
  function when<T>(key: string, load: () => Promise<T>, empty: T): Promise<T> {
    return shows.has(key) ? load() : Promise.resolve(empty);
  }
  const noResults = { results: [] };
  const noGenres = { genres: [] as TmdbGenre[] };
  const customShelves = visible.filter((shelf) => shelf.custom);

  const [
    recentlyAdded,
    trending,
    popularMovies,
    upcomingMovies,
    popularSeries,
    upcomingSeries,
    movieGenres,
    tvGenres,
    studios,
    networks,
    customPages,
  ] = await Promise.all([
    when(
      "recentlyAdded",
      () => (viewer.libraryOwnerId ? getRecentlyAdded(viewer.libraryOwnerId, SHELF_LENGTH) : Promise.resolve([])),
      [],
    ),
    when("trending", () => getTrendingAll().catch(() => noResults), noResults),
    when("popularMovies", () => discoverMovies({ sort: "popularity", page: 1 }).catch(() => noResults), noResults),
    when("upcomingMovies", () => getUpcomingMovies().catch(() => noResults), noResults),
    when("popularSeries", () => discoverTv({ sort: "popularity", page: 1 }).catch(() => noResults), noResults),
    when("upcomingSeries", () => getUpcomingTv().catch(() => noResults), noResults),
    when("movieGenres", () => getMovieGenres().catch(() => noGenres), noGenres),
    when("seriesGenres", () => getTvGenres().catch(() => noGenres), noGenres),
    when(
      "studios",
      () => Promise.all(CURATED_STUDIO_IDS.map((id) => getCompanyDetails(id).catch(() => null))),
      [] as (Awaited<ReturnType<typeof getCompanyDetails>> | null)[],
    ),
    when(
      "networks",
      () => Promise.all(CURATED_NETWORK_IDS.map((id) => getNetworkDetails(id).catch(() => null))),
      [] as (Awaited<ReturnType<typeof getNetworkDetails>> | null)[],
    ),
    Promise.all(
      customShelves.map((shelf) =>
        fetchCustomShelfPage(shelf, 1, viewer, { pageSize: SHELF_LENGTH, preview: true }).then((page) =>
          page.items.slice(0, SHELF_LENGTH),
        ),
      ),
    ),
  ]);

  const trendingItems = trending.results
    .filter((item) => item.media_type === "movie" || item.media_type === "tv")
    .slice(0, 20);
  const popularMovieItems = popularMovies.results.slice(0, 20);
  const popularSeriesItems = popularSeries.results.slice(0, 20);

  // TMDb's /movie/upcoming endpoint is really "currently in theaters or
  // about to be" for the given region, not strictly "release date is in the
  // future" — it can include already-released classics that got a limited
  // anniversary re-release. Filter to titles whose actual release date
  // hasn't happened yet.
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcomingMovieItems = upcomingMovies.results
    .filter((item) => item.release_date && item.release_date >= todayStr)
    .slice(0, 20);
  const upcomingSeriesItems = upcomingSeries.results.slice(0, 20);

  const movieGenreList = movieGenres.genres.slice(0, 12);
  const tvGenreList = tvGenres.genres.slice(0, 12);
  const [movieGenreBackdrops, tvGenreBackdropList] = await Promise.all([
    fetchMovieGenreBackdrops(movieGenreList),
    fetchTvGenreBackdrops(tvGenreList),
  ]);

  const customItems = new Map<string, ShelfItem[]>(customShelves.map((shelf, i) => [shelf.id, customPages[i]]));
  const statusMap: Map<string, LibraryStatus> = viewer.libraryOwnerId
    ? await getLibraryStatusMap(viewer.libraryOwnerId, [
        ...trendingItems.map((i) => ({ mediaType: i.media_type as MediaType, tmdbId: i.id })),
        ...popularMovieItems.map((i) => ({ mediaType: "movie" as MediaType, tmdbId: i.id })),
        ...upcomingMovieItems.map((i) => ({ mediaType: "movie" as MediaType, tmdbId: i.id })),
        ...popularSeriesItems.map((i) => ({ mediaType: "tv" as MediaType, tmdbId: i.id })),
        ...upcomingSeriesItems.map((i) => ({ mediaType: "tv" as MediaType, tmdbId: i.id })),
        ...customPages
          .flat()
          .filter((i) => !i.status)
          .map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId })),
      ])
    : new Map();

  const studioItems = studios.filter((s): s is NonNullable<typeof s> => s !== null);
  const networkItems = networks.filter((n): n is NonNullable<typeof n> => n !== null);

  return {
    /** The rows to show, in the admin's order (hidden ones left out). */
    layout: visible,
    recentlyAdded,
    trendingItems,
    popularMovieItems,
    upcomingMovieItems,
    popularSeriesItems,
    upcomingSeriesItems,
    movieGenreList,
    movieGenreBackdrops,
    tvGenreList,
    tvGenreBackdropList,
    studioItems,
    networkItems,
    /** Each custom row's first titles, by row id. */
    customItems,
    statusMap,
  };
}
