import { type TmdbCompanyRef } from "@/lib/tmdb/client";
import { dedupeCompanies } from "@/lib/tmdb/company-groups";
import { StudioChip } from "@/components/studio-chip";

export function StudioRow({ companies }: { companies: TmdbCompanyRef[] }) {
  if (companies.length === 0) return null;

  const items = dedupeCompanies(companies);

  return (
    <section>
      <h2 className="mb-4 font-display text-xl text-text-primary">Studio</h2>
      <div className="flex flex-wrap gap-3">
        {items.map((item) => (
          <StudioChip key={item.tmdbId} tmdbId={item.tmdbId} name={item.name} logoPath={item.logoPath} />
        ))}
      </div>
    </section>
  );
}
