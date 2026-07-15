import { PosterCard } from "@/components/poster-card";
import { PosterRow, PosterRowItem } from "@/components/poster-row";
import { StatusBadge, type LibraryStatus } from "@/components/status-badge";
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
}: {
  items: SimilarTitle[];
  statusMap: Map<string, LibraryStatus>;
}) {
  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 font-display text-xl text-text-primary">More like this</h2>
      <PosterRow>
        {items.map((item) => {
          const status = statusMap.get(`${item.mediaType}:${item.tmdbId}`);
          return (
            <PosterRowItem key={`${item.mediaType}-${item.tmdbId}`}>
              <PosterCard
                href={`/title/${item.mediaType}/${item.tmdbId}`}
                posterPath={item.posterPath}
                name={item.name}
                year={item.year}
                badge={status && <StatusBadge status={status} compact />}
              />
            </PosterRowItem>
          );
        })}
      </PosterRow>
    </section>
  );
}
