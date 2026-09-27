import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { titles } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { getUserLibrary, type LibraryItem } from "@/lib/library/query";
import { getCollection } from "@/lib/tmdb/client";
import type { TmdbMovieDetails } from "@/lib/tmdb/client";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { TV_FRANCHISE_GROUPS } from "@/lib/tmdb/tv-franchise-groups";
import { splitCollection } from "@/lib/library/query-policy";

export { splitCollection };

// The Library page's "Missing from collections" tab: franchises the
// household owns at least one part of, but not all of — e.g. Iron Man
// without Iron Man 2/3, so the whole trilogy shows with the missing parts
// offering the usual Add / Request. Movies use TMDb's own collection data
// (`belongs_to_collection`); TV has no such concept on TMDb, so it's the
// same hand-curated crossover list the title page uses.

export type CollectionItem = {
  tmdbId: number;
  mediaType: MediaType;
  name: string;
  posterPath: string | null;
  year: string | null;
};

export type IncompleteCollection = {
  key: string;
  title: string;
  /** Only set for real TMDb collections (movies) — hand-curated TV groups
   * have no TMDb collection id to favorite against. */
  collectionId?: number;
  items: CollectionItem[];
  /** The parts not in the library, in release order. */
  missing: CollectionItem[];
  /** An owned member of the collection, which "Request all missing"
   * (POST /titles/{type}/{id}/request-all-missing) is asked about. */
  ownedTmdbId: number;
};

export async function getIncompleteCollections(
  userId: string,
  library?: LibraryItem[],
): Promise<IncompleteCollection[]> {
  const items = library ?? (await getUserLibrary(userId));
  const ownedMovieIds = new Set(items.filter((i) => i.mediaType === "movie").map((i) => i.tmdbId));
  const ownedTvIds = new Set(items.filter((i) => i.mediaType === "tv").map((i) => i.tmdbId));

  const collections: IncompleteCollection[] = [];

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

    const fetched = await Promise.all([...collectionIds].map((id) => getCollection(id).catch(() => null)));

    for (const collection of fetched) {
      if (!collection) continue;
      const parts: CollectionItem[] = [...collection.parts]
        .sort((a, b) => (a.release_date || "").localeCompare(b.release_date || ""))
        .map((part) => ({
          tmdbId: part.id,
          mediaType: "movie" as MediaType,
          name: part.title,
          posterPath: part.poster_path,
          year: (part.release_date || "").slice(0, 4) || null,
        }));
      const { owned, missing, incomplete } = splitCollection(parts, ownedMovieIds);
      if (!incomplete) continue;
      collections.push({
        key: `collection-${collection.id}`,
        title: collection.name,
        collectionId: collection.id,
        items: parts,
        missing,
        ownedTmdbId: owned[0].tmdbId,
      });
    }
  }

  const seenGroupKeys = new Set<string>();
  for (const tmdbId of ownedTvIds) {
    const group = TV_FRANCHISE_GROUPS.find((g) => g.memberTmdbIds.includes(tmdbId));
    if (!group || seenGroupKeys.has(group.key)) continue;
    seenGroupKeys.add(group.key);
    if (!group.memberTmdbIds.some((id) => !ownedTvIds.has(id))) continue;

    const members = await Promise.all(
      group.memberTmdbIds.map((id) => getOrFetchTitle("tv", id).catch(() => null)),
    );
    const parts: CollectionItem[] = members
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .map((m) => ({
        tmdbId: m.tmdbId,
        mediaType: "tv" as MediaType,
        name: m.name,
        posterPath: m.posterPath,
        year: (m.releaseDate || m.firstAirDate || "").slice(0, 4) || null,
      }));
    const { owned, missing, incomplete } = splitCollection(parts, ownedTvIds);
    if (!incomplete) continue;
    collections.push({ key: `tv-${group.key}`, title: group.displayName, items: parts, missing, ownedTmdbId: owned[0].tmdbId });
  }

  return collections.sort((a, b) => a.title.localeCompare(b.title));
}
