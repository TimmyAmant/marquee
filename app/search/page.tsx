import { auth } from "@/auth";
import { SearchBar } from "@/components/search-bar";
import { PosterGrid } from "@/components/poster-grid";
import { PosterCard } from "@/components/poster-card";
import { StatusBadge } from "@/components/status-badge";
import { StudioChip } from "@/components/studio-chip";
import { searchMulti, searchCompany } from "@/lib/tmdb/client";
import { getLibraryStatusMap } from "@/lib/library/query";
import { dedupeCompanies } from "@/lib/tmdb/company-groups";
import type { MediaType } from "@/lib/db/schema";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim();

  if (!query) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl text-text-primary">Search Marquee</h1>
        <div className="mt-8">
          <SearchBar />
        </div>
      </div>
    );
  }

  const [multi, companies] = await Promise.all([
    searchMulti(query).catch(() => null),
    searchCompany(query).catch(() => null),
  ]);

  const people = multi?.results.filter((r) => r.media_type === "person") ?? [];
  const titleResults = multi?.results.filter((r) => r.media_type === "movie" || r.media_type === "tv") ?? [];
  const companyResults = dedupeCompanies(companies?.results ?? []);

  const hasResults = people.length + titleResults.length + companyResults.length > 0;

  const session = await auth();
  const statusMap = session?.user
    ? await getLibraryStatusMap(
        session.user.id,
        titleResults.map((t) => ({ mediaType: t.media_type as MediaType, tmdbId: t.id })),
      )
    : new Map();

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-10">
        <SearchBar initialValue={query} />
      </div>

      {!hasResults && (
        <p className="text-center text-text-secondary">
          No results for &ldquo;{query}&rdquo;.
        </p>
      )}

      {people.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 font-display text-xl text-text-primary">People</h2>
          <PosterGrid>
            {people.map((person) => (
              <PosterCard
                key={person.id}
                href={`/person/${person.id}`}
                posterPath={person.profile_path ?? null}
                name={person.name ?? ""}
                subtitle={person.known_for_department}
              />
            ))}
          </PosterGrid>
        </section>
      )}

      {companyResults.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 font-display text-xl text-text-primary">Studios</h2>
          <div className="flex flex-wrap gap-3">
            {companyResults.map((company) => (
              <StudioChip key={company.tmdbId} tmdbId={company.tmdbId} name={company.name} logoPath={company.logoPath} />
            ))}
          </div>
        </section>
      )}

      {titleResults.length > 0 && (
        <section>
          <h2 className="mb-4 font-display text-xl text-text-primary">Titles</h2>
          <PosterGrid>
            {titleResults.map((title) => {
              const status = statusMap.get(`${title.media_type}:${title.id}`);
              return (
                <PosterCard
                  key={`${title.media_type}-${title.id}`}
                  href={`/title/${title.media_type}/${title.id}`}
                  posterPath={title.poster_path ?? null}
                  name={title.title || title.name || ""}
                  year={(title.release_date || title.first_air_date || "").slice(0, 4)}
                  badge={status && <StatusBadge status={status} compact />}
                />
              );
            })}
          </PosterGrid>
        </section>
      )}
    </div>
  );
}
