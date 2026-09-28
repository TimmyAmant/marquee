"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PosterGrid } from "@/components/poster-grid";
import { PosterCard } from "@/components/poster-card";
import { StatusBadge } from "@/components/status-badge";
import { FavoriteButton } from "@/components/favorite-button";
import { QuickAddButton } from "@/components/quick-add-button";
import { loadMoreDiscoverItems, loadMoreDiscoverList } from "@/app/discover/actions";
import { loadMoreSearchSection } from "@/app/search/actions";
import type { DiscoverCardData, DiscoverFetchParams } from "@/app/discover/fetch-items";
import { useT } from "@/lib/i18n/client";

/**
 * Movies/Series' results grid — server-rendered with the first page, then
 * grows by itself as the user scrolls, fetching subsequent pages via
 * loadMoreDiscoverItems (the same fetchDiscoverItems logic the initial
 * render used) instead of a "Next" link that reloaded the whole page.
 *
 * Also the grid behind a Discover shelf's "See all" (app/discover/[list]),
 * which passes `list` instead of `fetchParams`.
 *
 * The caller (discover-view.tsx) must render this with a `key` derived
 * from the current filter selection, so changing a filter mounts a fresh
 * instance (fresh state, fresh `initialItems`) instead of this component
 * having to notice new props and reset itself mid-life.
 */
export function InfiniteResultsGrid({
  initialItems,
  initialHasNextPage,
  fetchParams,
  list,
  search,
  signedIn,
  showTypeLabel = false,
  emptyMessage,
}: {
  initialItems: DiscoverCardData[];
  initialHasNextPage: boolean;
  /** Everything loadMoreDiscoverItems needs except which page. */
  fetchParams?: Omit<DiscoverFetchParams, "page">;
  /** A Discover list (lib/discover/lists.ts), paged by loadMoreDiscoverList. */
  list?: string;
  /** A search section's See all (/search?q=&type=), paged by loadMoreSearchSection. */
  search?: { query: string; type: "movie" | "tv" };
  signedIn: boolean;
  /** The MOVIE/SERIES pill, for lists that mix the two. */
  showTypeLabel?: boolean;
  emptyMessage?: string;
}) {
  const t = useT();
  const [items, setItems] = useState(initialItems);
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [isPending, startTransition] = useTransition();
  const nextPageRef = useRef(2);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || isPending) return;
        const page = nextPageRef.current;
        startTransition(async () => {
          const result = list
            ? await loadMoreDiscoverList(list, page)
            : fetchParams
              ? await loadMoreDiscoverItems({ ...fetchParams, page })
              : search
                ? await loadMoreSearchSection(search.query, search.type, page).then(({ section, hasNextPage }) => ({
                    items: section && (section.kind === "movie" || section.kind === "tv") ? section.items : [],
                    hasNextPage,
                  }))
                : { items: [], hasNextPage: false };
          setItems((prev) => {
            // TMDb's popularity ranking shifts between separate requests, so
            // a title already shown in an earlier batch can reappear at the
            // start of this one — drop anything already on screen instead
            // of showing it twice back to back.
            const seen = new Set(prev.map((i) => `${i.mediaType}:${i.tmdbId}`));
            const fresh = result.items.filter((i) => !seen.has(`${i.mediaType}:${i.tmdbId}`));
            return [...prev, ...fresh];
          });
          setHasNextPage(result.hasNextPage);
          nextPageRef.current = page + 1;
        });
      },
      // Starts loading the next batch well before the sentinel actually
      // scrolls into view, so new rows are usually ready by the time the
      // user reaches the bottom rather than after.
      { rootMargin: "1200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isPending, fetchParams, list, search]);

  if (items.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        {emptyMessage ?? t("discover.gridEmpty")}
      </p>
    );
  }

  return (
    <div>
      <PosterGrid>
        {items.map((item) => (
          <PosterCard
            key={`${item.mediaType}-${item.tmdbId}`}
            href={`/title/${item.mediaType}/${item.tmdbId}`}
            posterPath={item.posterPath}
            name={item.name}
            year={item.year}
            meta={item.meta}
            rating={item.rating}
            overview={item.overview}
            typeLabel={
              showTypeLabel
                ? { mediaType: item.mediaType, text: item.mediaType === "movie" ? t("common.movie") : t("common.series") }
                : undefined
            }
            badge={item.status && <StatusBadge status={item.status} compact />}
            status={item.status}
            episodes={item.episodes}
            favoriteAction={
              signedIn && (
                <FavoriteButton
                  entityType={item.mediaType}
                  tmdbId={item.tmdbId}
                  initialFavorited={item.favorited}
                  compact
                />
              )
            }
            quickAction={
              item.canQuickAdd ? (
                <QuickAddButton mediaType={item.mediaType} tmdbId={item.tmdbId} />
              ) : undefined
            }
          />
        ))}
      </PosterGrid>

      {hasNextPage && (
        <div ref={sentinelRef} className="mt-10 flex h-10 items-center justify-center">
          {isPending && <span className="text-sm text-text-muted">{t("discover.loadingMore")}</span>}
        </div>
      )}
    </div>
  );
}
