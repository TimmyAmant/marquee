import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { titleCard, statusKey, yearOf } from "@/lib/api/mappers";
import { loadDiscoverShelves } from "@/lib/pages/discover";
import type { DiscoverShelf, DiscoverShelves, GenreTile, NetworkCard, TitleCard } from "@/lib/api/types";
import type { MediaType } from "@/lib/db/schema";
import { DISCOVER_SEE_ALL, type DiscoverShelfKey } from "@/lib/discover/lists";
import { isBuiltInShelf } from "@/lib/discover/shelves";

/** The Discover landing page's shelves, in page order. Cards carry library
 * status only — the website shows no favorite/add buttons on these shelves.
 * `seeAll` says where each shelf's "See all" goes; `shelves` (0.49+) is the
 * admin's arrangement, their own rows included. */
export const GET = withApi(async (request): Promise<DiscoverShelves> => {
  const ctx = await requireApiUser(request);
  await requireTmdbConfigured();

  const data = await loadDiscoverShelves(await ctx.viewer());
  const status = (mediaType: MediaType, tmdbId: number) => data.statusMap.get(statusKey(mediaType, tmdbId)) ?? null;

  const fixed = {
    recentlyAdded: data.recentlyAdded.map((item) => titleCard(item, { status: item.status ?? null })),
    watchlist: data.watchlist.map((item) => titleCard(item, { status: item.status ?? null })),
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
  } satisfies Record<DiscoverShelfKey, unknown>;

  const builtInShelf = (key: DiscoverShelfKey, title: string): DiscoverShelf => {
    const base = { id: key, kind: key, title, custom: false, results: null, genres: null, logos: null, seeAll: DISCOVER_SEE_ALL[key] };
    if (key === "movieGenres" || key === "seriesGenres") return { ...base, genres: fixed[key] as GenreTile[] };
    if (key === "studios") {
      return { ...base, logos: fixed.studios.map(({ tmdbId, name, logoPath }): NetworkCard => ({ tmdbId, name, logoPath })) };
    }
    if (key === "networks") return { ...base, logos: fixed.networks };
    return { ...base, results: fixed[key] as TitleCard[] };
  };

  const shelves: DiscoverShelf[] = data.layout.map((shelf) => {
    if (!shelf.custom && isBuiltInShelf(shelf.id)) return builtInShelf(shelf.id, shelf.title);
    const items = data.customItems.get(shelf.id) ?? [];
    return {
      id: shelf.id,
      kind: shelf.kind,
      title: shelf.title,
      custom: true,
      results: items.map((item) =>
        titleCard(item, { status: item.status ?? status(item.mediaType, item.tmdbId) }),
      ),
      genres: null,
      logos: null,
      seeAll: { type: "list", list: shelf.id, mediaType: null },
    };
  });

  return { ...fixed, seeAll: DISCOVER_SEE_ALL, shelves };
});
