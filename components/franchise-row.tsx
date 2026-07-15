import { PosterCard } from "@/components/poster-card";
import { PosterGrid } from "@/components/poster-grid";
import { StatusBadge, type LibraryStatus } from "@/components/status-badge";
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
}: {
  title: string;
  items: FranchiseItem[];
  statusMap: Map<string, LibraryStatus>;
}) {
  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 font-display text-xl text-text-primary">{title}</h2>
      <PosterGrid>
        {items.map((item) => {
          const status = statusMap.get(`${item.mediaType}:${item.tmdbId}`);
          return (
            <PosterCard
              key={`${item.mediaType}-${item.tmdbId}`}
              href={`/title/${item.mediaType}/${item.tmdbId}`}
              posterPath={item.posterPath}
              name={item.name}
              year={item.year}
              badge={status && <StatusBadge status={status} compact />}
            />
          );
        })}
      </PosterGrid>
    </section>
  );
}
