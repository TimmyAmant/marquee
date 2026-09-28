import {
  getMovieGenres,
  getTvGenres,
  getNetworkDetails,
  type TmdbMovieDetails,
  type TmdbTvDetails,
} from "@/lib/tmdb/client";
import { getFavoritedTmdbIds } from "@/lib/favorites/query";
import { getEpisodeCountMap, getLibraryStatusMap } from "@/lib/library/query";
import type { EpisodeCounts } from "@/lib/library/episode-counts";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { getRecentlyWatched } from "@/lib/plex/sync";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import type { LibraryStatus } from "@/components/status-badge";
import type { MediaType } from "@/lib/db/schema";

// Data behind /movies and /series (app/discover/discover-view.tsx) other than
// the results grid itself (app/discover/fetch-items.ts) — shared with
// GET /api/v1/movies|series/extras.

export type DiscoverSortParam = "popularity" | "top_rated" | "newest";

/** The page's own query-string parsing for the sort filter. */
export function parseDiscoverSort(value: string | undefined | null): DiscoverSortParam {
  return value === "top_rated" ? "top_rated" : value === "newest" ? "newest" : "popularity";
}

/** Genre dropdown options, plus the network chip when filtering by one (TV only). */
export async function loadBrowseFilters(lockedType: MediaType, networkId: number | undefined) {
  const [genresForFilter, network] = await Promise.all([
    (lockedType === "movie" ? getMovieGenres() : getTvGenres()).then((r) => r.genres).catch(() => []),
    networkId ? getNetworkDetails(networkId).catch(() => null) : Promise.resolve(null),
  ]);
  return { genresForFilter, network };
}

// A plain, non-component helper — kept outside any Server Component render
// body since the React compiler's purity check flags Date.now() called
// directly inside one.
function getDayIndex(): number {
  return Math.floor(Date.now() / 86_400_000);
}

export type BecauseYouWatchedItem = {
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  year: string | null;
};

/**
 * "Because you watched" — rotates daily through your last several watched
 * titles (rather than always the single most recent one) so the row doesn't
 * look identical on every visit, using TMDb's own recommendations for
 * whichever title comes up (already cached in `titles.rawTmdb` from whenever
 * that title's page/sync last fetched it, so this is usually a free read
 * rather than a fresh TMDb call). Only shown with no genre/year filter.
 */
/** How many posters the "Because you watched" row holds: enough to run
 * past the edge of a wide window, so it scrolls like the other rows. */
export const BECAUSE_YOU_WATCHED_SIZE = 20;

export async function loadBecauseYouWatched(
  viewer: ViewerIdentity,
  lockedType: MediaType,
  filters: { genreId?: number; year?: number },
) {
  let becauseYouWatched: { title: string; items: BecauseYouWatchedItem[] } | null = null;
  if (viewer.libraryOwnerId && !filters.genreId && !filters.year) {
    const recentList = await getRecentlyWatched(viewer.libraryOwnerId, 10).catch(() => []);
    // Filtered by lockedType *before* picking, not after — otherwise
    // /movies and /series would only ever show this row on days the
    // rotation happens to land on a title of their own type, even when the
    // viewer has plenty of recently-watched movies (or shows) to draw on.
    const eligible = recentList.filter((r) => r.mediaType === lockedType);
    const pick = eligible.length > 0 ? getDayIndex() % eligible.length : -1;
    const recent = pick >= 0 ? eligible[pick] : undefined;
    if (recent) {
      const watchedTitle = await getOrFetchTitle(recent.mediaType, recent.tmdbId).catch(() => null);
      const recsOf = (title: typeof watchedTitle) =>
        ((title?.rawTmdb as (TmdbMovieDetails | TmdbTvDetails) | null)?.recommendations?.results ?? []);
      const recs = [...recsOf(watchedTitle)];
      // TMDb often has fewer than a full row for one title; top it up from
      // the other recently watched titles of this type (cached reads), in
      // rotation order, so the row fills the screen instead of stopping short.
      if (recs.length < BECAUSE_YOU_WATCHED_SIZE) {
        for (let step = 1; step < eligible.length && recs.length < BECAUSE_YOU_WATCHED_SIZE * 2; step++) {
          const other = eligible[(pick + step) % eligible.length];
          const otherTitle = await getOrFetchTitle(other.mediaType, other.tmdbId).catch(() => null);
          recs.push(...recsOf(otherTitle));
        }
      }
      // Without the titles you just watched, and each title once.
      const skip = new Set(eligible.map((r) => r.tmdbId));
      const items: typeof recs = [];
      for (const r of recs) {
        if (items.length >= BECAUSE_YOU_WATCHED_SIZE) break;
        if (skip.has(r.id)) continue;
        skip.add(r.id);
        items.push(r);
      }
      if (watchedTitle && items.length > 0) {
        becauseYouWatched = {
          title: watchedTitle.name,
          items: items.map((r) => ({
            mediaType: recent.mediaType,
            tmdbId: r.id,
            name: r.title || r.name || "",
            posterPath: r.poster_path,
            year: (r.release_date || r.first_air_date || "").slice(0, 4) || null,
          })),
        };
      }
    }
  }

  const [statusMap, episodeCounts]: [Map<string, LibraryStatus>, Map<string, EpisodeCounts>] =
    becauseYouWatched && viewer.libraryOwnerId
      ? await Promise.all([
          getLibraryStatusMap(viewer.libraryOwnerId, becauseYouWatched.items),
          getEpisodeCountMap(viewer.libraryOwnerId, becauseYouWatched.items),
        ])
      : [new Map(), new Map()];

  const [radarrCredential, sonarrCredential, favoritedIds] =
    becauseYouWatched && viewer.userId
      ? await Promise.all([
          getArrCredential(viewer.userId, "radarr"),
          getArrCredential(viewer.userId, "sonarr"),
          getFavoritedTmdbIds(
            viewer.userId,
            lockedType,
            becauseYouWatched.items.map((i) => i.tmdbId),
          ),
        ])
      : [null, null, new Set<number>()];

  const arrConfigured =
    lockedType === "movie" ? isArrFullyConfigured(radarrCredential) : isArrFullyConfigured(sonarrCredential);

  return { becauseYouWatched, statusMap, episodeCounts, favoritedIds, arrConfigured };
}
