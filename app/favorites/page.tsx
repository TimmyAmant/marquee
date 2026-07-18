import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PosterGrid } from "@/components/poster-grid";
import { PosterCard } from "@/components/poster-card";
import { StudioChip } from "@/components/studio-chip";
import { FavoriteButton } from "@/components/favorite-button";
import {
  getFavoritePeople,
  getFavoriteCompanies,
  getFavoriteTitles,
  getFavoriteCollectionIds,
} from "@/lib/favorites/query";
import { dedupeCompanies } from "@/lib/tmdb/company-groups";
import { getCollection } from "@/lib/tmdb/client";

export default async function FavoritesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id;

  const [favoritePeople, favoriteCompanies, favoriteMovies, favoriteShows, collectionIds] =
    await Promise.all([
      getFavoritePeople(userId),
      getFavoriteCompanies(userId),
      getFavoriteTitles(userId, "movie"),
      getFavoriteTitles(userId, "tv"),
      getFavoriteCollectionIds(userId),
    ]);

  // Collections have no local cache table (unlike titles/people/companies),
  // so each favorited one is fetched live from TMDb by id — there are
  // usually only a handful of these for any one person.
  const collections = (
    await Promise.all(collectionIds.map((id) => getCollection(id).catch(() => null)))
  ).filter((c): c is NonNullable<typeof c> => c !== null);

  // Two different, ungrouped members of the same conglomerate (e.g. Marvel
  // Studios favorited from one movie, Pixar from another) should still show
  // up as one merged "The Walt Disney Company" entry, matching how the
  // Studio section on title pages already collapses these.
  const dedupedCompanies = dedupeCompanies(
    favoriteCompanies.map((c) => ({ id: c.tmdbId, name: c.name, logo_path: c.logoPath })),
  );

  const hasFavorites =
    favoritePeople.length > 0 ||
    dedupedCompanies.length > 0 ||
    favoriteMovies.length > 0 ||
    favoriteShows.length > 0 ||
    collections.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
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
              const firstPart = [...collection.parts].sort((a, b) =>
                (a.release_date || "").localeCompare(b.release_date || ""),
              )[0];
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
