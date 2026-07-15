import { PosterCard } from "@/components/poster-card";
import { PosterRow, PosterRowItem } from "@/components/poster-row";
import type { TmdbCastMember } from "@/lib/tmdb/client";

export function CastRow({ cast }: { cast: TmdbCastMember[] }) {
  if (cast.length === 0) return null;

  const topBilled = [...cast].sort((a, b) => a.order - b.order).slice(0, 20);

  return (
    <section>
      <h2 className="mb-4 font-display text-xl text-text-primary">Cast</h2>
      <PosterRow>
        {topBilled.map((member) => (
          <PosterRowItem key={member.id}>
            <PosterCard
              href={`/person/${member.id}`}
              posterPath={member.profile_path}
              name={member.name}
              subtitle={member.character}
            />
          </PosterRowItem>
        ))}
      </PosterRow>
    </section>
  );
}
