import Link from "next/link";
import { PaginatedPosterGrid } from "@/components/paginated-poster-grid";
import { PosterCard } from "@/components/poster-card";
import { PosterRow, PosterRowItem } from "@/components/poster-row";
import { StatusBadge } from "@/components/status-badge";
import { YearSelect } from "@/components/year-select";
import { SortSelect } from "@/components/sort-select";
import { GenreSelect } from "@/components/genre-select";
import { TypeSelect } from "@/components/type-select";
import { QuickAddButton } from "@/components/quick-add-button";
import {
  getMovieGenres,
  getTvGenres,
  discoverMovies,
  discoverTv,
  getNetworkDetails,
  type DiscoverSort,
  type TmdbDiscoverResult,
  type TmdbMovieDetails,
  type TmdbTvDetails,
} from "@/lib/tmdb/client";
import { getLibraryStatusMap } from "@/lib/library/query";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { getFavoritedTmdbIds } from "@/lib/favorites/query";
import { FavoriteButton } from "@/components/favorite-button";
import { getRecentlyWatched } from "@/lib/plex/sync";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { SurpriseMeButton } from "@/components/surprise-me-button";
import type { MediaType } from "@/lib/db/schema";

export type DiscoverSearchParams = {
  type?: string;
  genre?: string;
  sort?: string;
  page?: string;
  year?: string;
  hideOwned?: string;
  /** TV-only — from Discover's Networks row (e.g. /series?network=213). */
  network?: string;
};

type DisplayType = "movie" | "tv" | "all";

function buildHref(
  basePath: string,
  current: DiscoverSearchParams,
  overrides: Partial<DiscoverSearchParams>,
) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();
  if (merged.type) params.set("type", merged.type);
  if (merged.genre) params.set("genre", merged.genre);
  if (merged.sort) params.set("sort", merged.sort);
  if (merged.page && merged.page !== "1") params.set("page", merged.page);
  if (merged.year) params.set("year", merged.year);
  if (merged.hideOwned) params.set("hideOwned", merged.hideOwned);
  if (merged.network) params.set("network", merged.network);
  const qs = params.toString();
  return `${basePath}${qs ? `?${qs}` : ""}`;
}

// A plain, non-component helper — kept outside the page's render body since
// the React compiler's purity check flags Date.now() called directly inside
// a Server Component, even though this route is already fully dynamic
// (auth() + searchParams), specifically to prevent the value depending on
// unstable render timing.
function getDayIndex(): number {
  return Math.floor(Date.now() / 86_400_000);
}

function toDisplayItem(item: TmdbDiscoverResult, mediaType: MediaType) {
  return {
    tmdbId: item.id,
    mediaType,
    name: item.title || item.name || "",
    posterPath: item.poster_path,
    year: (item.release_date || item.first_air_date || "").slice(0, 4) || null,
    releaseDate: item.release_date || item.first_air_date || "",
    overview: item.overview || null,
    rating: item.vote_average ?? null,
    popularity: item.popularity ?? 0,
    genreId: item.genre_ids?.[0] ?? null,
  };
}

/** "Both" mode merges separate movie and TV result lists, which need to be
 * re-interleaved by whichever sort the user actually picked — matching the
 * `sort_by` already sent to TMDb for each individual list. */
function compareBySort(
  a: ReturnType<typeof toDisplayItem>,
  b: ReturnType<typeof toDisplayItem>,
  sort: DiscoverSort,
): number {
  if (sort === "top_rated") return (b.rating ?? 0) - (a.rating ?? 0);
  if (sort === "newest") return b.releaseDate.localeCompare(a.releaseDate);
  return b.popularity - a.popularity;
}

/**
 * Shared render/data logic behind /movies and /series — each renders this
 * view with `lockedType` pinned so the type toggle (and the underlying TMDb
 * query) can never drift to the other media type. Discover's own landing
 * page (app/discover/page.tsx) is a separate curated-rows page and doesn't
 * use this component.
 */
export async function DiscoverView({
  searchParams,
  lockedType,
  basePath,
}: {
  searchParams: Promise<DiscoverSearchParams>;
  lockedType?: "movie" | "tv";
  basePath: string;
}) {
  const sp = await searchParams;
  const viewer = await getViewerContext();

  const displayType: DisplayType =
    lockedType ?? (sp.type === "tv" ? "tv" : sp.type === "all" ? "all" : "movie");
  const sort: DiscoverSort =
    sp.sort === "top_rated" ? "top_rated" : sp.sort === "newest" ? "newest" : "popularity";
  const genreId = sp.genre ? Number(sp.genre) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const year = sp.year ? Number(sp.year) : undefined;
  const hideOwned = Boolean(viewer.session) && sp.hideOwned !== "0";
  // Only meaningful for TV — a movie or "both" request with a stray
  // ?network= is treated the same as not having one.
  const networkId = displayType === "tv" && sp.network ? Number(sp.network) : undefined;

  const [movieGenres, tvGenres, network] = await Promise.all([
    getMovieGenres().catch(() => ({ genres: [] })),
    getTvGenres().catch(() => ({ genres: [] })),
    networkId ? getNetworkDetails(networkId).catch(() => null) : Promise.resolve(null),
  ]);
  const movieGenreMap = new Map(movieGenres.genres.map((g) => [g.id, g.name]));
  const tvGenreMap = new Map(tvGenres.genres.map((g) => [g.id, g.name]));
  const genresForFilter = displayType === "tv" ? tvGenres.genres : movieGenres.genres;

  // Fetch several underlying TMDb pages per screen, not just one. When "hide
  // titles you already track" removes a lot of matches (as it will for an
  // account with a large synced library), filtering a single 20-item page
  // can leave the grid nearly empty no matter which page you're on — fetch
  // a much bigger batch in that case specifically, rather than inflating
  // every request, so PaginatedPosterGrid still has enough survivors left
  // to fill a full 5 rows even on a very wide screen.
  const BATCH_SIZE = hideOwned ? 10 : 4;
  const startTmdbPage = (page - 1) * BATCH_SIZE + 1;
  const tmdbPages = Array.from({ length: BATCH_SIZE }, (_, i) => startTmdbPage + i);
  const emptyResponse = { results: [], total_pages: 1, total_results: 0 };

  let rawItems: ReturnType<typeof toDisplayItem>[];
  let hasNextPage: boolean;

  if (displayType === "all") {
    const [movieResponses, tvResponses] = await Promise.all([
      Promise.all(
        tmdbPages.map((p) => discoverMovies({ sort, page: p, year }).catch(() => emptyResponse)),
      ),
      Promise.all(
        tmdbPages.map((p) => discoverTv({ sort, page: p, year }).catch(() => emptyResponse)),
      ),
    ]);

    rawItems = [
      ...movieResponses.flatMap((r) => r.results).map((i) => toDisplayItem(i, "movie")),
      ...tvResponses.flatMap((r) => r.results).map((i) => toDisplayItem(i, "tv")),
    ].sort((a, b) => compareBySort(a, b, sort));

    const maxTotalPages = Math.max(...movieResponses.map((r) => r.total_pages), ...tvResponses.map((r) => r.total_pages));
    hasNextPage = tmdbPages[tmdbPages.length - 1] < Math.min(maxTotalPages, 500);
  } else {
    const responses = await Promise.all(
      tmdbPages.map((p) =>
        (displayType === "movie"
          ? discoverMovies({ genreId, sort, page: p, year })
          : discoverTv({ genreId, sort, page: p, year, networkId })
        ).catch(() => emptyResponse),
      ),
    );

    rawItems = responses.flatMap((r) => r.results).map((i) => toDisplayItem(i, displayType));
    const maxTotalPages = Math.max(...responses.map((r) => r.total_pages));
    hasNextPage = tmdbPages[tmdbPages.length - 1] < Math.min(maxTotalPages, 500);
  }

  // "Because you watched" — rotates daily through your last several
  // watched titles (rather than always the single most recent one) so the
  // row doesn't look identical on every visit, using TMDb's own
  // recommendations for whichever title comes up (already cached in
  // `titles.rawTmdb` from whenever that title's page/sync last fetched it,
  // so this is usually a free read rather than a fresh TMDb call).
  let becauseYouWatched: { title: string; items: ReturnType<typeof toDisplayItem>[] } | null = null;
  if (viewer.libraryOwnerId && page === 1 && !genreId && !year) {
    const recentList = await getRecentlyWatched(viewer.libraryOwnerId, 10).catch(() => []);
    // Filtered by lockedType *before* picking, not after — otherwise /movies
    // and /series would only ever show this row on days the rotation happens
    // to land on a title of their own type, even when the viewer has plenty
    // of recently-watched movies (or shows) to draw on.
    const eligible = lockedType ? recentList.filter((r) => r.mediaType === lockedType) : recentList;
    const recent = eligible.length > 0 ? eligible[getDayIndex() % eligible.length] : undefined;
    if (recent) {
      const watchedTitle = await getOrFetchTitle(recent.mediaType, recent.tmdbId).catch(() => null);
      const raw = watchedTitle?.rawTmdb as (TmdbMovieDetails | TmdbTvDetails) | null;
      const recs = raw?.recommendations?.results ?? [];
      if (watchedTitle && recs.length > 0) {
        becauseYouWatched = {
          title: watchedTitle.name,
          items: recs
            .slice(0, 12)
            .map((r) =>
              toDisplayItem(
                {
                  id: r.id,
                  title: r.title,
                  name: r.name,
                  poster_path: r.poster_path,
                  backdrop_path: null,
                  release_date: r.release_date,
                  first_air_date: r.first_air_date,
                  overview: "",
                  vote_average: 0,
                  popularity: 0,
                },
                recent.mediaType,
              ),
            ),
        };
      }
    }
  }

  // Combine the main grid and the "Because you watched" row for the shared
  // status/favorite lookups below, so each only needs one query instead of
  // two — otherwise the row's cards would silently render with no
  // status badge, favorite star, or quick-add button at all.
  const allDisplayedItems = becauseYouWatched ? [...rawItems, ...becauseYouWatched.items] : rawItems;

  const statusMap = viewer.libraryOwnerId
    ? await getLibraryStatusMap(
        viewer.libraryOwnerId,
        allDisplayedItems.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId })),
      )
    : new Map();

  const items = hideOwned
    ? rawItems.filter((i) => !statusMap.has(`${i.mediaType}:${i.tmdbId}`))
    : rawItems;

  const [radarrCredential, sonarrCredential, favoritedMovieIds, favoritedTvIds] = viewer.session
    ? await Promise.all([
        getArrCredential(viewer.userId, "radarr"),
        getArrCredential(viewer.userId, "sonarr"),
        getFavoritedTmdbIds(
          viewer.userId,
          "movie",
          allDisplayedItems.filter((i) => i.mediaType === "movie").map((i) => i.tmdbId),
        ),
        getFavoritedTmdbIds(
          viewer.userId,
          "tv",
          allDisplayedItems.filter((i) => i.mediaType === "tv").map((i) => i.tmdbId),
        ),
      ])
    : [null, null, new Set<number>(), new Set<number>()];

  const arrConfigured = {
    movie: isArrFullyConfigured(radarrCredential),
    tv: isArrFullyConfigured(sonarrCredential),
  };

  return (
    <div className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10 h-96"
        style={{
          background:
            "radial-gradient(120% 60% at 50% -10%, rgba(224,166,62,0.14) 0%, rgba(10,10,12,0) 60%)",
        }}
      />

      <div className="px-6 py-12">
        {becauseYouWatched && (
          <section className="mt-8">
            <h2 className="mb-4 font-display text-xl text-text-primary">
              Because you watched {becauseYouWatched.title}
            </h2>
            <PosterRow>
              {becauseYouWatched.items.map((item) => {
                const status = statusMap.get(`${item.mediaType}:${item.tmdbId}`);
                const canQuickAdd = Boolean(viewer.session) && arrConfigured[item.mediaType] && !status;
                return (
                  <PosterRowItem key={`${item.mediaType}-${item.tmdbId}`}>
                    <PosterCard
                      href={`/title/${item.mediaType}/${item.tmdbId}`}
                      posterPath={item.posterPath}
                      name={item.name}
                      year={item.year}
                      badge={status && <StatusBadge status={status} compact />}
                      status={status}
                      favoriteAction={
                        viewer.session && (
                          <FavoriteButton
                            entityType={item.mediaType}
                            tmdbId={item.tmdbId}
                            initialFavorited={
                              item.mediaType === "movie"
                                ? favoritedMovieIds.has(item.tmdbId)
                                : favoritedTvIds.has(item.tmdbId)
                            }
                            compact
                          />
                        )
                      }
                      quickAction={
                        canQuickAdd ? (
                          <QuickAddButton mediaType={item.mediaType} tmdbId={item.tmdbId} />
                        ) : undefined
                      }
                    />
                  </PosterRowItem>
                );
              })}
            </PosterRow>
          </section>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!lockedType && (
            <TypeSelect currentType={displayType} currentParams={sp} basePath={basePath} />
          )}

          <SortSelect currentSort={sort} currentParams={sp} basePath={basePath} />

          {displayType !== "all" && genresForFilter.length > 0 && (
            <GenreSelect
              currentGenre={genreId}
              currentParams={sp}
              basePath={basePath}
              genres={genresForFilter}
            />
          )}

          <YearSelect currentYear={sp.year} currentParams={sp} basePath={basePath} />

          {network && (
            <Link
              href={buildHref(basePath, sp, { network: undefined, page: undefined })}
              className="rounded-full border border-accent px-3 py-1.5 text-xs text-accent transition-colors hover:opacity-80"
            >
              {network.name} ✕
            </Link>
          )}

          {viewer.session && (
            <Link
              href={buildHref(basePath, sp, { hideOwned: hideOwned ? "0" : "1", page: undefined })}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                hideOwned
                  ? "border-accent text-accent"
                  : "border-border text-text-secondary hover:text-text-primary"
              }`}
            >
              {hideOwned ? "✓ Hiding titles you already track" : "Hide titles you already track"}
            </Link>
          )}

          <SurpriseMeButton
            displayType={displayType}
            genreId={genreId}
            year={year}
            hideOwned={hideOwned}
          />
        </div>

        <div className="mt-8">
          {items.length === 0 ? (
            <p className="text-sm text-text-muted">
              Nothing left here — try a different genre or year, or turn off &ldquo;Hide titles you
              already track&rdquo;.
            </p>
          ) : (
            <PaginatedPosterGrid>
              {items.map((item) => {
                const status = statusMap.get(`${item.mediaType}:${item.tmdbId}`);
                const genreMap = item.mediaType === "movie" ? movieGenreMap : tvGenreMap;
                const genreName = item.genreId ? genreMap.get(item.genreId) : undefined;
                const canQuickAdd = Boolean(viewer.session) && arrConfigured[item.mediaType] && !status;

                return (
                  <PosterCard
                    key={`${item.mediaType}-${item.tmdbId}`}
                    href={`/title/${item.mediaType}/${item.tmdbId}`}
                    posterPath={item.posterPath}
                    name={item.name}
                    year={item.year}
                    meta={genreName}
                    rating={item.rating}
                    overview={item.overview}
                    badge={status && <StatusBadge status={status} compact />}
                    status={status}
                    favoriteAction={
                      viewer.session && (
                        <FavoriteButton
                          entityType={item.mediaType}
                          tmdbId={item.tmdbId}
                          initialFavorited={
                            item.mediaType === "movie"
                              ? favoritedMovieIds.has(item.tmdbId)
                              : favoritedTvIds.has(item.tmdbId)
                          }
                          compact
                        />
                      )
                    }
                    quickAction={
                      canQuickAdd ? (
                        <QuickAddButton mediaType={item.mediaType} tmdbId={item.tmdbId} />
                      ) : undefined
                    }
                  />
                );
              })}
            </PaginatedPosterGrid>
          )}
        </div>

        <div className="mt-10 flex items-center justify-center gap-3">
          {page > 1 && (
            <Link
              href={buildHref(basePath, sp, { page: String(page - 1) })}
              className="rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-text-muted">Page {page}</span>
          {hasNextPage && (
            <Link
              href={buildHref(basePath, sp, { page: String(page + 1) })}
              className="rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent"
            >
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
