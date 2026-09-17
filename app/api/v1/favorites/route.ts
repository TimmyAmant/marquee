import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { titleCard, yearOf } from "@/lib/api/mappers";
import { firstCollectionPart, loadFavoritesPage } from "@/lib/pages/favorites";
import type { FavoritesResponse } from "@/lib/api/types";

/** The Favorites page, most recently favorited first within each section.
 * Collections are looked up live on TMDb; one that fails to load is left out,
 * as on the website. */
export const GET = withApi(async (request): Promise<FavoritesResponse> => {
  const ctx = await requireApiUser(request);
  const data = await loadFavoritesPage(ctx.user.id);

  return {
    movies: data.favoriteMovies.map((title) =>
      titleCard(
        { mediaType: "movie", tmdbId: title.tmdbId, name: title.name, posterPath: title.posterPath, year: yearOf(title.releaseDate) },
        { favorited: true },
      ),
    ),
    tv: data.favoriteShows.map((title) =>
      titleCard(
        { mediaType: "tv", tmdbId: title.tmdbId, name: title.name, posterPath: title.posterPath, year: yearOf(title.firstAirDate) },
        { favorited: true },
      ),
    ),
    collections: data.collections.map((collection) => ({
      collectionId: collection.id,
      name: collection.name,
      posterPath: collection.poster_path,
      firstMovieTmdbId: firstCollectionPart(collection.parts)?.id ?? null,
    })),
    people: data.favoritePeople.map((person) => ({
      tmdbId: person.tmdbId,
      name: person.name,
      profilePath: person.profilePath,
      knownForDepartment: null,
      favorited: true,
    })),
    studios: data.dedupedCompanies.map((company) => ({
      tmdbId: company.tmdbId,
      name: company.name,
      logoPath: company.logoPath,
      favorited: true,
    })),
  };
});
