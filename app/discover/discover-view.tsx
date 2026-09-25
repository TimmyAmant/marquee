import Link from "next/link";
import { InfiniteResultsGrid } from "@/components/infinite-results-grid";
import { PosterCard } from "@/components/poster-card";
import { PosterRowItem } from "@/components/poster-row";
import { Shelf } from "@/components/shelf";
import { StatusBadge } from "@/components/status-badge";
import { YearSelect } from "@/components/year-select";
import { SortSelect } from "@/components/sort-select";
import { GenreSelect } from "@/components/genre-select";
import { QuickAddButton } from "@/components/quick-add-button";
import type { DiscoverSort } from "@/lib/tmdb/client";
import { fetchDiscoverItems } from "@/app/discover/fetch-items";
import { FavoriteButton } from "@/components/favorite-button";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { loadBecauseYouWatched, loadBrowseFilters, parseDiscoverSort } from "@/lib/pages/browse";
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

  const sort: DiscoverSort = parseDiscoverSort(sp.sort);
  const genreId = sp.genre ? Number(sp.genre) : undefined;
  const year = sp.year ? Number(sp.year) : undefined;
  const hideOwned = Boolean(viewer.session) && sp.hideOwned !== "0";
  // Only meaningful for TV — a movie request with a stray ?network= is
  // treated the same as not having one.
  const networkId = lockedType === "tv" && sp.network ? Number(sp.network) : undefined;

  // Filters + first results page + "Because you watched" are all shared with
  // GET /api/v1/movies|series(/extras) — see lib/pages/browse.ts.
  const [{ genresForFilter, network }, { items: firstPageItems, hasNextPage: firstPageHasNext }] =
    await Promise.all([
      loadBrowseFilters(lockedType, networkId),
      fetchDiscoverItems({ lockedType, sort, genreId, year, networkId, hideOwned, page: 1 }, viewer),
    ]);

  const { becauseYouWatched, statusMap, favoritedIds, arrConfigured } = await loadBecauseYouWatched(
    viewer,
    lockedType,
    { genreId, year },
  );

  return (
    // Reaches back under the nav rail's 72px margin (and pads the shelves
    // back out of it) so the glow runs to the window edge, like a title's
    // backdrop, instead of stopping in a visible seam.
    <div className="relative overflow-hidden md:-ml-[72px] md:pl-[72px]">
      <div
        className="pointer-events-none absolute inset-0 -z-10 h-96"
        style={{
          background:
            "radial-gradient(120% 60% at 50% -10%, rgba(224,166,62,0.14) 0%, rgba(10,10,12,0) 60%)",
        }}
      />

      <div className="flex flex-col gap-12 pl-4 pr-0 py-6 sm:pl-7 sm:py-7">
        {becauseYouWatched && (
          <Shelf title={`Because you watched ${becauseYouWatched.title}`}>
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
          </Shelf>
        )}

        <div className="flex flex-wrap items-center gap-3 pr-4 sm:pr-7">
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

        <div className="pr-4 sm:pr-7">
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
