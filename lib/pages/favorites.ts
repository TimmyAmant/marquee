import {
  getFavoritePeople,
  getFavoriteCompanies,
  getFavoriteTitles,
  getFavoriteCollectionIds,
} from "@/lib/favorites/query";
import { dedupeCompanies } from "@/lib/tmdb/company-groups";
import { getCollection } from "@/lib/tmdb/client";
import { withSavedTranslations } from "@/lib/tmdb/translations";
import { getLocale } from "@/lib/i18n/server";
import { getEpisodeCountMap } from "@/lib/library/query";
import type { EpisodeCounts } from "@/lib/library/episode-counts";

/** Everything /favorites shows — shared with GET /api/v1/favorites.
 * `libraryOwnerId` is the household library the viewer sees, for the
 * favorited series' episode counts. */
export async function loadFavoritesPage(userId: string, libraryOwnerId?: string | null) {
  const locale = await getLocale();
  const [favoritePeople, favoriteCompanies, favoriteMovies, favoriteShows, collectionIds] =
    await Promise.all([
      getFavoritePeople(userId),
      getFavoriteCompanies(userId),
      // In the viewer's language where a translation is saved (most were
      // favorited from their title page, which saves one).
      getFavoriteTitles(userId, "movie").then((rows) => withSavedTranslations(rows, locale)),
      getFavoriteTitles(userId, "tv").then((rows) => withSavedTranslations(rows, locale)),
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

  // The favorited series' have/total, where the library has them.
  const episodeCounts = libraryOwnerId
    ? await getEpisodeCountMap(libraryOwnerId, favoriteShows.map((s) => ({ mediaType: "tv" as const, tmdbId: s.tmdbId })))
    : new Map<string, EpisodeCounts>();

  const hasFavorites =
    favoritePeople.length > 0 ||
    dedupedCompanies.length > 0 ||
    favoriteMovies.length > 0 ||
    favoriteShows.length > 0 ||
    collections.length > 0;

  return { favoritePeople, dedupedCompanies, favoriteMovies, favoriteShows, collections, hasFavorites, episodeCounts };
}

/** The movie a favorited collection's card links to — its earliest release. */
export function firstCollectionPart<T extends { release_date: string | null }>(parts: T[]): T | undefined {
  return [...parts].sort((a, b) => (a.release_date || "").localeCompare(b.release_date || ""))[0];
}
