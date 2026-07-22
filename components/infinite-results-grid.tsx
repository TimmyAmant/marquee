"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PosterGrid } from "@/components/poster-grid";
import { PosterCard } from "@/components/poster-card";
import { StatusBadge } from "@/components/status-badge";
import { FavoriteButton } from "@/components/favorite-button";
import { QuickAddButton } from "@/components/quick-add-button";
import { loadMoreDiscoverItems } from "@/app/discover/actions";
import type { DiscoverCardData, DiscoverFetchParams } from "@/app/discover/fetch-items";

/**
 * Movies/Series' results grid — server-rendered with the first page, then
 * grows by itself as the user scrolls, fetching subsequent pages via
 * loadMoreDiscoverItems (the same fetchDiscoverItems logic the initial
 * render used) instead of a "Next" link that reloaded the whole page.
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
  signedIn,
}: {
  initialItems: DiscoverCardData[];
  initialHasNextPage: boolean;
  /** Everything loadMoreDiscoverItems needs except which page. */
  fetchParams: Omit<DiscoverFetchParams, "page">;
  signedIn: boolean;
}) {
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
          const result = await loadMoreDiscoverItems({ ...fetchParams, page });
          setItems((prev) => [...prev, ...result.items]);
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
  }, [hasNextPage, isPending, fetchParams]);

  if (items.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        Nothing left here — try a different genre or year, or turn off &ldquo;Hide titles you
        already track&rdquo;.
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
            badge={item.status && <StatusBadge status={item.status} compact />}
            status={item.status}
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
          {isPending && <span className="text-sm text-text-muted">Loading more…</span>}
        </div>
      )}
    </div>
  );
}
