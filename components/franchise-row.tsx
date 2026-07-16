import { PosterCard } from "@/components/poster-card";
import { PosterGrid } from "@/components/poster-grid";
import { StatusBadge, type LibraryStatus } from "@/components/status-badge";
import { FavoriteButton } from "@/components/favorite-button";
import { QuickAddButton } from "@/components/quick-add-button";
import type { MediaType } from "@/lib/db/schema";

export type FranchiseItem = {
  tmdbId: number;
  mediaType: MediaType;
  name: string;
  posterPath: string | null;
  year: string | null;
};

export function FranchiseRow({
  title,
  items,
  statusMap,
  favoritedIds,
  showFavorite,
  arrConfigured,
  collectionId,
  collectionFavorited,
}: {
  title: string;
  items: FranchiseItem[];
  statusMap: Map<string, LibraryStatus>;
  favoritedIds?: Set<number>;
  showFavorite?: boolean;
  /** Omitted when signed out or nothing is configured. */
  arrConfigured?: { movie: boolean; tv: boolean };
  /** Only set for real TMDb collections (movie franchises) — hand-curated TV
   * crossover groups have no TMDb collection id to favorite. */
  collectionId?: number;
  collectionFavorited?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="font-display text-xl text-text-primary">{title}</h2>
        {showFavorite && collectionId !== undefined && (
          <FavoriteButton
            entityType="collection"
            tmdbId={collectionId}
            initialFavorited={collectionFavorited ?? false}
          />
        )}
      </div>
      <PosterGrid>
        {items.map((item) => {
          const status = statusMap.get(`${item.mediaType}:${item.tmdbId}`);
          const canQuickAdd = !status && arrConfigured?.[item.mediaType];
          return (
            <PosterCard
              key={`${item.mediaType}-${item.tmdbId}`}
              href={`/title/${item.mediaType}/${item.tmdbId}`}
              posterPath={item.posterPath}
              name={item.name}
              year={item.year}
              badge={status && <StatusBadge status={status} compact />}
              favoriteAction={
                showFavorite && (
                  <FavoriteButton
                    entityType={item.mediaType}
                    tmdbId={item.tmdbId}
                    initialFavorited={favoritedIds?.has(item.tmdbId) ?? false}
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
      </PosterGrid>
    </section>
  );
}
