import Link from "next/link";
import { InfiniteResultsGrid } from "@/components/infinite-results-grid";
import { PosterCard } from "@/components/poster-card";
import { PosterRow, PosterRowItem } from "@/components/poster-row";
import { StatusBadge } from "@/components/status-badge";
import { YearSelect } from "@/components/year-select";
import { SortSelect } from "@/components/sort-select";
import { GenreSelect } from "@/components/genre-select";
import { QuickAddButton } from "@/components/quick-add-button";
import {
  getMovieGenres,
  getTvGenres,
  getNetworkDetails,
  type DiscoverSort,
  type TmdbMovieDetails,
  type TmdbTvDetails,
} from "@/lib/tmdb/client";
import { fetchDiscoverItems } from "@/app/discover/fetch-items";
import { getFavoritedTmdbIds } from "@/lib/favorites/query";
import { getLibraryStatusMap } from "@/lib/library/query";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { FavoriteButton } from "@/components/favorite-button";
import { getRecentlyWatched } from "@/lib/plex/sync";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { SurpriseMeButton } from "@/components/surprise-me-button";
import type { MediaType } from "@/lib/db/schema";

export type DiscoverSearchParams = {
  genre?: string;
  sort?: string;
  year?: string;
  hideOwned?: string;
  /** TV-only — from Discover's Networks row (e.g. /series?network=213). */
  network?: string;
};

function buildHref(
  basePath: string,
  current: DiscoverSearchParams,
  overrides: Partial<DiscoverSearchParams>,
) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();
  if (merged.genre) params.set("genre", merged.genre);
  if (merged.sort) params.set("sort", merged.sort);
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

/**
 * Shared render/data logic behind /movies and /series — each renders this
 * view with `lockedType` pinned so the underlying TMDb query is always one
 * media type. Discover's own landing page (app/discover/page.tsx) is a
 * separate curated-rows page and doesn't use this component.
 *
 * The results grid itself (InfiniteResultsGrid) only renders the first
 * page here — everything past that loads via infinite scroll, not a
 * server-rendered "Next" link.
 */
export async function DiscoverView({
  searchParams,
  lockedType,
  basePath,
}: {
  searchParams: Promise<DiscoverSearchParams>;
  lockedType: MediaType;
  basePath: string;
}) {
  const sp = await searchParams;
  const viewer = await getViewerContext();

  const sort: DiscoverSort =
    sp.sort === "top_rated" ? "top_rated" : sp.sort === "newest" ? "newest" : "popularity";
  const genreId = sp.genre ? Number(sp.genre) : undefined;
  const year = sp.year ? Number(sp.year) : undefined;
  const hideOwned = Boolean(viewer.session) && sp.hideOwned !== "0";
  // Only meaningful for TV — a movie request with a stray ?network= is
  // treated the same as not having one.
  const networkId = lockedType === "tv" && sp.network ? Number(sp.network) : undefined;

  const [genresForFilter, network, { items: firstPageItems, hasNextPage: firstPageHasNext }] =
    await Promise.all([
      (lockedType === "movie" ? getMovieGenres() : getTvGenres())
        .then((r) => r.genres)
        .catch(() => []),
      networkId ? getNetworkDetails(networkId).catch(() => null) : Promise.resolve(null),
      fetchDiscoverItems({ lockedType, sort, genreId, year, networkId, hideOwned, page: 1 }),
    ]);

  // "Because you watched" — rotates daily through your last several
  // watched titles (rather than always the single most recent one) so the
  // row doesn't look identical on every visit, using TMDb's own
  // recommendations for whichever title comes up (already cached in
  // `titles.rawTmdb` from whenever that title's page/sync last fetched it,
  // so this is usually a free read rather than a fresh TMDb call).
  let becauseYouWatched: {
    title: string;
    items: { mediaType: MediaType; tmdbId: number; name: string; posterPath: string | null; year: string | null }[];
  } | null = null;
  if (viewer.libraryOwnerId && !genreId && !year) {
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

  const statusMap = becauseYouWatched && viewer.libraryOwnerId
    ? await getLibraryStatusMap(
        viewer.libraryOwnerId,
        becauseYouWatched.items.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId })),
      )
    : new Map();

  const [radarrCredential, sonarrCredential, favoritedIds] =
    becauseYouWatched && viewer.session
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
                const canQuickAdd = Boolean(viewer.session) && arrConfigured && !status;
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
                            initialFavorited={favoritedIds.has(item.tmdbId)}
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
          <SortSelect currentSort={sort} currentParams={sp} basePath={basePath} />

          {genresForFilter.length > 0 && (
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
              href={buildHref(basePath, sp, { network: undefined })}
              className="rounded-full border border-accent px-3 py-1.5 text-xs text-accent transition-colors hover:opacity-80"
            >
              {network.name} ✕
            </Link>
          )}

          {viewer.session && (
            <Link
              href={buildHref(basePath, sp, { hideOwned: hideOwned ? "0" : "1" })}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                hideOwned
                  ? "border-accent text-accent"
                  : "border-border text-text-secondary hover:text-text-primary"
              }`}
            >
              {hideOwned ? "✓ Hiding titles you already track" : "Hide titles you already track"}
            </Link>
          )}

          <SurpriseMeButton displayType={lockedType} genreId={genreId} year={year} hideOwned={hideOwned} />
        </div>

        <div className="mt-8">
          <InfiniteResultsGrid
            key={`${lockedType}:${sort}:${genreId ?? ""}:${year ?? ""}:${networkId ?? ""}:${hideOwned}`}
            initialItems={firstPageItems}
            initialHasNextPage={firstPageHasNext}
            fetchParams={{ lockedType, sort, genreId, year, networkId, hideOwned }}
            signedIn={Boolean(viewer.session)}
          />
        </div>
      </div>
    </div>
  );
}
