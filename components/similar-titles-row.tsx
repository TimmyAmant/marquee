import { PosterCard } from "@/components/poster-card";
import { PosterRow, PosterRowItem } from "@/components/poster-row";
import { StatusBadge, type LibraryStatus } from "@/components/status-badge";
import { FavoriteButton } from "@/components/favorite-button";
import { QuickAddButton } from "@/components/quick-add-button";
import { RequestButton } from "@/components/request-button";
import type { MediaType } from "@/lib/db/schema";

export type SimilarTitle = {
  tmdbId: number;
  mediaType: MediaType;
  name: string;
  posterPath: string | null;
  year: string | null;
};

export function SimilarTitlesRow({
  items,
  statusMap,
  requestStatusMap,
  favoritedIds,
  showFavorite,
  arrConfigured,
  isAdmin,
}: {
  items: SimilarTitle[];
  statusMap: Map<string, LibraryStatus>;
  /** This viewer's own non-rejected request per title, if any — so a title
   * already requested shows "Requested" instead of the button again. Absent
   * when signed out (members never see the request button then anyway). */
  requestStatusMap?: Map<string, string>;
  favoritedIds?: Set<number>;
  showFavorite?: boolean;
  arrConfigured?: { movie: boolean; tv: boolean };
  /** Undefined when signed out. Admins get the direct Add action; household
   * members get Request instead, same as everywhere else in the app. */
  isAdmin?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 font-display text-xl text-text-primary">More like this</h2>
      <PosterRow>
        {items.map((item) => {
          const status = statusMap.get(`${item.mediaType}:${item.tmdbId}`);
          const canQuickAdd = !status && isAdmin === true && arrConfigured?.[item.mediaType];
          const canRequest = !status && isAdmin === false;
          return (
            <PosterRowItem key={`${item.mediaType}-${item.tmdbId}`}>
              <PosterCard
                href={`/title/${item.mediaType}/${item.tmdbId}`}
                posterPath={item.posterPath}
                name={item.name}
                year={item.year}
                typeLabel={item.mediaType === "movie" ? "MOVIE" : "SERIES"}
                badge={status && <StatusBadge status={status} compact />}
                status={status}
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
                  ) : canRequest ? (
                    <RequestButton
                      mediaType={item.mediaType}
                      tmdbId={item.tmdbId}
                      title={item.name}
                      posterPath={item.posterPath}
                      compact
                      alreadyRequested={requestStatusMap?.has(`${item.mediaType}:${item.tmdbId}`) ?? false}
                    />
                  ) : undefined
                }
              />
            </PosterRowItem>
          );
        })}
      </PosterRow>
    </section>
  );
}
