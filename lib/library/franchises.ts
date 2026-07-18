import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { titles } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { getUserLibrary } from "@/lib/library/query";
import { getCollection } from "@/lib/tmdb/client";
import type { TmdbMovieDetails } from "@/lib/tmdb/client";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { TV_FRANCHISE_GROUPS } from "@/lib/tmdb/tv-franchise-groups";
import type { FranchiseItem } from "@/components/franchise-row";

export type LibraryFranchise = {
  key: string;
  title: string;
  items: FranchiseItem[];
  /** Only set for real TMDb collections (movies) — hand-curated TV groups
   * have no TMDb collection id to favorite against. */
  collectionId?: number;
};

/**
 * Franchises the user owns at least one part of, but not all of — e.g. own
 * Iron Man but not Iron Man 2/3, so the whole trilogy shows up with 2/3
 * offering the usual add-to-Radarr/Sonarr action. Movies use TMDb's own
 * "collection" data (`belongs_to_collection`); TV has no such concept from
 * TMDb, so it's the same hand-curated crossover list the title page uses.
 */
export async function getIncompleteFranchises(userId: string): Promise<LibraryFranchise[]> {
  const library = await getUserLibrary(userId);
  const ownedMovieIds = new Set(library.filter((i) => i.mediaType === "movie").map((i) => i.tmdbId));
  const ownedTvIds = new Set(library.filter((i) => i.mediaType === "tv").map((i) => i.tmdbId));

  const franchises: LibraryFranchise[] = [];

  if (ownedMovieIds.size > 0) {
    const rows = await db
      .select({ tmdbId: titles.tmdbId, rawTmdb: titles.rawTmdb })
      .from(titles)
      .where(and(eq(titles.mediaType, "movie"), inArray(titles.tmdbId, [...ownedMovieIds])));

    const collectionIds = new Set<number>();
    for (const row of rows) {
      const ref = (row.rawTmdb as TmdbMovieDetails | null)?.belongs_to_collection;
      if (ref) collectionIds.add(ref.id);
    }

    const collections = await Promise.all(
      [...collectionIds].map((id) => getCollection(id).catch(() => null)),
    );

    for (const collection of collections) {
      if (!collection) continue;

      const items: FranchiseItem[] = [...collection.parts]
        .sort((a, b) => (a.release_date || "").localeCompare(b.release_date || ""))
        .map((part) => ({
          tmdbId: part.id,
          mediaType: "movie" as MediaType,
          name: part.title,
          posterPath: part.poster_path,
          year: (part.release_date || "").slice(0, 4) || null,
        }));

      const hasOwned = items.some((item) => ownedMovieIds.has(item.tmdbId));
      const hasMissing = items.some((item) => !ownedMovieIds.has(item.tmdbId));
      if (hasOwned && hasMissing) {
        franchises.push({
          key: `collection-${collection.id}`,
          title: collection.name,
          items,
          collectionId: collection.id,
        });
      }
    }
  }

  const seenGroupKeys = new Set<string>();
  for (const tmdbId of ownedTvIds) {
    const group = TV_FRANCHISE_GROUPS.find((g) => g.memberTmdbIds.includes(tmdbId));
    if (!group || seenGroupKeys.has(group.key)) continue;
    seenGroupKeys.add(group.key);

    const hasMissing = group.memberTmdbIds.some((id) => !ownedTvIds.has(id));
    if (!hasMissing) continue;

    const members = await Promise.all(
      group.memberTmdbIds.map((id) => getOrFetchTitle("tv", id).catch(() => null)),
    );
    const items: FranchiseItem[] = members
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .map((m) => ({
        tmdbId: m.tmdbId,
        mediaType: "tv" as MediaType,
        name: m.name,
        posterPath: m.posterPath,
        year: (m.releaseDate || m.firstAirDate || "").slice(0, 4) || null,
      }));

    franchises.push({ key: `tv-${group.key}`, title: group.displayName, items });
  }

  return franchises;
}
