import {
  getMovieGenres,
  getTvGenres,
  getNetworkDetails,
  type TmdbMovieDetails,
  type TmdbTvDetails,
} from "@/lib/tmdb/client";
import { getFavoritedTmdbIds } from "@/lib/favorites/query";
import { getLibraryStatusMap } from "@/lib/library/query";
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
    const recent = eligible.length > 0 ? eligible[getDayIndex() % eligible.length] : undefined;
    if (recent) {
      const watchedTitle = await getOrFetchTitle(recent.mediaType, recent.tmdbId).catch(() => null);
      const raw = watchedTitle?.rawTmdb as (TmdbMovieDetails | TmdbTvDetails) | null;
      const recs = raw?.recommendations?.results ?? [];
      if (watchedTitle && recs.length > 0) {
        becauseYouWatched = {
          title: watchedTitle.name,
          items: recs.slice(0, 12).map((r) => ({
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

  const statusMap: Map<string, LibraryStatus> =
    becauseYouWatched && viewer.libraryOwnerId
      ? await getLibraryStatusMap(
          viewer.libraryOwnerId,
          becauseYouWatched.items.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId })),
        )
      : new Map();

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

  return { becauseYouWatched, statusMap, favoritedIds, arrConfigured };
}
