import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PosterGrid } from "@/components/poster-grid";
import { PosterCard } from "@/components/poster-card";
import { StudioChip } from "@/components/studio-chip";
import { FavoriteButton } from "@/components/favorite-button";
import { firstCollectionPart, loadFavoritesPage } from "@/lib/pages/favorites";

export default async function FavoritesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id;

  // Shared with GET /api/v1/favorites.
  const { favoritePeople, dedupedCompanies, favoriteMovies, favoriteShows, collections, hasFavorites } =
    await loadFavoritesPage(userId);

  return (
    <div className="px-4 py-6 sm:pl-7 sm:pr-7 sm:py-7">
      {!hasFavorites && (
        <p className="text-sm text-text-muted">
          Nothing favorited yet — star anything from its page or card to see it here.
        </p>
      )}

      {favoriteMovies.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-display text-xl text-text-primary">Movies</h2>
          <PosterGrid>
            {favoriteMovies.map((title) => (
              <PosterCard
                key={title.id}
                href={`/title/movie/${title.tmdbId}`}
                posterPath={title.posterPath}
                name={title.name}
                year={(title.releaseDate || "").slice(0, 4) || null}
                favoriteAction={
                  <FavoriteButton entityType="movie" tmdbId={title.tmdbId} initialFavorited compact />
                }
              />
            ))}
          </PosterGrid>
        </section>
      )}

      {favoriteShows.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-display text-xl text-text-primary">TV Shows</h2>
          <PosterGrid>
            {favoriteShows.map((title) => (
              <PosterCard
                key={title.id}
                href={`/title/tv/${title.tmdbId}`}
                posterPath={title.posterPath}
                name={title.name}
                year={(title.firstAirDate || "").slice(0, 4) || null}
                favoriteAction={
                  <FavoriteButton entityType="tv" tmdbId={title.tmdbId} initialFavorited compact />
                }
              />
            ))}
          </PosterGrid>
        </section>
      )}

      {collections.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-display text-xl text-text-primary">Collections</h2>
          <PosterGrid>
            {collections.map((collection) => {
              const firstPart = firstCollectionPart(collection.parts);
              return (
                <PosterCard
                  key={collection.id}
                  href={firstPart ? `/title/movie/${firstPart.id}` : "#"}
                  posterPath={collection.poster_path}
                  name={collection.name}
                  favoriteAction={
                    <FavoriteButton
                      entityType="collection"
                      tmdbId={collection.id}
                      initialFavorited
                      compact
                    />
                  }
                />
              );
            })}
          </PosterGrid>
        </section>
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
                favoriteAction={
                  <FavoriteButton entityType="person" tmdbId={person.tmdbId} initialFavorited compact />
                }
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
                favoriteAction={
                  <FavoriteButton
                    entityType="company"
                    tmdbId={company.tmdbId}
                    initialFavorited
                    compact
                  />
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
