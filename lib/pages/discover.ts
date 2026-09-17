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
 * app/discover/page.tsx and GET /api/v1/discover. Each TMDb call fails soft to
 * an empty shelf, exactly like the page.
 */
export async function loadDiscoverShelves(viewer: ViewerIdentity) {
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
  ] = await Promise.all([
    viewer.libraryOwnerId ? getRecentlyAdded(viewer.libraryOwnerId, 20) : Promise.resolve([]),
    getTrendingAll().catch(() => ({ results: [] })),
    discoverMovies({ sort: "popularity", page: 1 }).catch(() => ({ results: [] })),
    getUpcomingMovies().catch(() => ({ results: [] })),
    discoverTv({ sort: "popularity", page: 1 }).catch(() => ({ results: [] })),
    getUpcomingTv().catch(() => ({ results: [] })),
    getMovieGenres().catch(() => ({ genres: [] })),
    getTvGenres().catch(() => ({ genres: [] })),
    Promise.all(CURATED_STUDIO_IDS.map((id) => getCompanyDetails(id).catch(() => null))),
    Promise.all(CURATED_NETWORK_IDS.map((id) => getNetworkDetails(id).catch(() => null))),
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

  const statusMap: Map<string, LibraryStatus> = viewer.libraryOwnerId
    ? await getLibraryStatusMap(viewer.libraryOwnerId, [
        ...trendingItems.map((i) => ({ mediaType: i.media_type as MediaType, tmdbId: i.id })),
        ...popularMovieItems.map((i) => ({ mediaType: "movie" as MediaType, tmdbId: i.id })),
        ...upcomingMovieItems.map((i) => ({ mediaType: "movie" as MediaType, tmdbId: i.id })),
        ...popularSeriesItems.map((i) => ({ mediaType: "tv" as MediaType, tmdbId: i.id })),
        ...upcomingSeriesItems.map((i) => ({ mediaType: "tv" as MediaType, tmdbId: i.id })),
      ])
    : new Map();

  const studioItems = studios.filter((s): s is NonNullable<typeof s> => s !== null);
  const networkItems = networks.filter((n): n is NonNullable<typeof n> => n !== null);

  return {
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
    statusMap,
  };
}
