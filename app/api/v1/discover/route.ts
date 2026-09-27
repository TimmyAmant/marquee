import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { titleCard, statusKey, yearOf } from "@/lib/api/mappers";
import { posterActions } from "@/lib/api/poster-actions";
import { loadPosterActionRules } from "@/lib/api/poster-action-rules";
import { loadDiscoverShelves } from "@/lib/pages/discover";
import type { DiscoverShelf, DiscoverShelves, GenreTile, NetworkCard, TitleCard } from "@/lib/api/types";
import type { MediaType } from "@/lib/db/schema";
import type { LibraryStatus } from "@/components/status-badge";
import { DISCOVER_SEE_ALL, type DiscoverShelfKey } from "@/lib/discover/lists";
import { isBuiltInShelf } from "@/lib/discover/shelves";

/** The Discover landing page's shelves, in page order. Cards carry library
 * status and the viewer's quick action (canQuickAdd / canRequest /
 * requested, lib/api/poster-actions.ts) but no favorite — the website shows
 * no favorite star on these shelves. `seeAll` says where each shelf's "See
 * all" goes; `shelves` (0.49+) is the admin's arrangement, their own rows
 * included. */
export const GET = withApi(async (request): Promise<DiscoverShelves> => {
  const ctx = await requireApiUser(request);
  await requireTmdbConfigured();

  const data = await loadDiscoverShelves(await ctx.viewer());
  const status = (mediaType: MediaType, tmdbId: number) => data.statusMap.get(statusKey(mediaType, tmdbId)) ?? null;

  // One request/blocklist lookup for every title on the page.
  const rules = await loadPosterActionRules(ctx.user, [
    ...data.recentlyAdded,
    ...data.trendingItems.map((i) => ({ mediaType: i.media_type as MediaType, tmdbId: i.id })),
    ...data.popularMovieItems.map((i) => ({ mediaType: "movie" as const, tmdbId: i.id })),
    ...data.upcomingMovieItems.map((i) => ({ mediaType: "movie" as const, tmdbId: i.id })),
    ...data.popularSeriesItems.map((i) => ({ mediaType: "tv" as const, tmdbId: i.id })),
    ...data.upcomingSeriesItems.map((i) => ({ mediaType: "tv" as const, tmdbId: i.id })),
    ...[...data.customItems.values()].flat(),
  ]);
  const withActions = (mediaType: MediaType, tmdbId: number, known?: LibraryStatus | null) => {
    const resolved = known ?? status(mediaType, tmdbId);
    return { status: resolved, ...posterActions(rules, mediaType, tmdbId, resolved) };
  };

  const fixed = {
    recentlyAdded: data.recentlyAdded.map((item) =>
      titleCard(item, withActions(item.mediaType, item.tmdbId, item.status ?? null)),
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
        withActions(mediaType, item.id),
      );
    }),
    popularMovies: data.popularMovieItems.map((item) =>
      titleCard(
        { mediaType: "movie", tmdbId: item.id, name: item.title || "", posterPath: item.poster_path, year: yearOf(item.release_date) },
        withActions("movie", item.id),
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
        withActions("movie", item.id),
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
        withActions("tv", item.id),
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
        withActions("tv", item.id),
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
      results: items.map((item) => titleCard(item, withActions(item.mediaType, item.tmdbId, item.status ?? null))),
      genres: null,
      logos: null,
      seeAll: { type: "list", list: shelf.id, mediaType: null },
    };
  });

  return { ...fixed, seeAll: DISCOVER_SEE_ALL, shelves };
});
