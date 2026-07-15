import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PosterGrid } from "@/components/poster-grid";
import { PosterCard } from "@/components/poster-card";
import { StudioChip } from "@/components/studio-chip";
import { getFavoritePeople, getFavoriteCompanies } from "@/lib/favorites/query";
import { dedupeCompanies } from "@/lib/tmdb/company-groups";

export default async function FavoritesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [favoritePeople, favoriteCompanies] = await Promise.all([
    getFavoritePeople(session.user.id),
    getFavoriteCompanies(session.user.id),
  ]);

  // Two different, ungrouped members of the same conglomerate (e.g. Marvel
  // Studios favorited from one movie, Pixar from another) should still show
  // up as one merged "The Walt Disney Company" entry, matching how the
  // Studio section on title pages already collapses these.
  const dedupedCompanies = dedupeCompanies(
    favoriteCompanies.map((c) => ({ id: c.tmdbId, name: c.name, logo_path: c.logoPath })),
  );

  const hasFavorites = favoritePeople.length > 0 || dedupedCompanies.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="font-display text-3xl text-text-primary">Favorites</h1>
      <p className="mt-1 text-sm text-text-secondary">
        People and studios you&rsquo;ve starred.
      </p>

      {!hasFavorites && (
        <p className="mt-10 text-sm text-text-muted">
          Nothing favorited yet — star a person or studio from their page to see it here.
        </p>
      )}

      {favoritePeople.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-display text-xl text-text-primary">People</h2>
          <PosterGrid>
            {favoritePeople.map((person) => (
              <PosterCard
                key={person.id}
                href={`/person/${person.tmdbId}`}
                posterPath={person.profilePath}
                name={person.name}
              />
            ))}
          </PosterGrid>
        </section>
      )}

      {dedupedCompanies.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-display text-xl text-text-primary">Studios</h2>
          <div className="flex flex-wrap gap-3">
            {dedupedCompanies.map((company) => (
              <StudioChip
                key={company.tmdbId}
                tmdbId={company.tmdbId}
                name={company.name}
                logoPath={company.logoPath}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
