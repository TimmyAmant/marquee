import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { titleCard, statusKey, yearOf } from "@/lib/api/mappers";
import { loadDiscoverShelves } from "@/lib/pages/discover";
import type { DiscoverShelves } from "@/lib/api/types";
import type { MediaType } from "@/lib/db/schema";

/** The Discover landing page's shelves, in page order. Cards carry library
 * status only — the website shows no favorite/add buttons on these shelves. */
export const GET = withApi(async (request): Promise<DiscoverShelves> => {
  const ctx = await requireApiUser(request);
  await requireTmdbConfigured();

  const data = await loadDiscoverShelves(await ctx.viewer());
  const status = (mediaType: MediaType, tmdbId: number) => data.statusMap.get(statusKey(mediaType, tmdbId)) ?? null;

  return {
    recentlyAdded: data.recentlyAdded.map((item) =>
      titleCard(item, { status: item.status ?? null }),
    ),
    trending: data.trendingItems.map((item) => {
      const mediaType = item.media_type as MediaType;
      return titleCard(
        {
          mediaType,
          tmdbId: item.id,
          name: item.title || item.name || "",
          posterPath: item.poster_path,
          year: yearOf(item.release_date || item.first_air_date),
        },
        { status: status(mediaType, item.id) },
      );
    }),
    popularMovies: data.popularMovieItems.map((item) =>
      titleCard(
        { mediaType: "movie", tmdbId: item.id, name: item.title || "", posterPath: item.poster_path, year: yearOf(item.release_date) },
        { status: status("movie", item.id) },
      ),
    ),
    movieGenres: data.movieGenreList.map((genre, i) => ({
      id: genre.id,
      name: genre.name,
      backdropPath: data.movieGenreBackdrops[i] ?? null,
    })),
    upcomingMovies: data.upcomingMovieItems.map((item) =>
      titleCard(
        { mediaType: "movie", tmdbId: item.id, name: item.title, posterPath: item.poster_path, year: yearOf(item.release_date) },
        { status: status("movie", item.id) },
      ),
    ),
    studios: data.studioItems.map((studio) => ({
      tmdbId: studio.id,
      name: studio.name,
      logoPath: studio.logo_path,
      favorited: null,
    })),
    popularSeries: data.popularSeriesItems.map((item) =>
      titleCard(
        { mediaType: "tv", tmdbId: item.id, name: item.name || "", posterPath: item.poster_path, year: yearOf(item.first_air_date) },
        { status: status("tv", item.id) },
      ),
    ),
    seriesGenres: data.tvGenreList.map((genre, i) => ({
      id: genre.id,
      name: genre.name,
      backdropPath: data.tvGenreBackdropList[i] ?? null,
    })),
    upcomingSeries: data.upcomingSeriesItems.map((item) =>
      titleCard(
        { mediaType: "tv", tmdbId: item.id, name: item.name || "", posterPath: item.poster_path, year: yearOf(item.first_air_date) },
        { status: status("tv", item.id) },
      ),
    ),
    networks: data.networkItems.map((network) => ({
      tmdbId: network.id,
      name: network.name,
      logoPath: network.logo_path,
    })),
  };
});
