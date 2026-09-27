import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  arrServers,
  arrStatusCache,
  jellyfinLibraryItems,
  jellyfinServers,
  plexLibraryItems,
  plexServers,
  titles,
} from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { arrRowStatus, toYear } from "@/lib/library/query-policy";
import { findDuplicates, type DuplicateGroup, type LibraryCopy } from "@/lib/library/duplicates-policy";

export type { DuplicateGroup, LibraryCopy };
export { findDuplicates, normalizePath } from "@/lib/library/duplicates-policy";

// The Library page's Duplicates tab (admin only): every copy of every title
// across every connected server, and which titles have more than one. The
// library list merges a title down to one row (a media server's copy wins),
// so this reads the raw rows instead of getUserLibrary.

const titleColumns = {
  mediaType: titles.mediaType,
  tmdbId: titles.tmdbId,
  name: titles.name,
  posterPath: titles.posterPath,
  releaseDate: titles.releaseDate,
  firstAirDate: titles.firstAirDate,
};

type TitleRow = {
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  releaseDate: string | null;
  firstAirDate: string | null;
};

/** Every title the household library has on more than one server or in
 * more than one file, A–Z. */
export async function getLibraryDuplicates(userId: string): Promise<DuplicateGroup[]> {
  const byKey = new Map<string, { title: TitleRow; copies: LibraryCopy[] }>();
  const add = (title: TitleRow, copy: LibraryCopy) => {
    const key = `${title.mediaType}:${title.tmdbId}`;
    const group = byKey.get(key) ?? { title, copies: [] };
    group.copies.push(copy);
    byKey.set(key, group);
  };

  const [arrRows, plexServerRows, jellyfinServerRows] = await Promise.all([
    db
      .select({
        title: titleColumns,
        provider: arrStatusCache.provider,
        status: arrStatusCache.status,
        monitored: arrStatusCache.monitored,
        filePath: arrStatusCache.filePath,
        sizeBytes: arrStatusCache.sizeBytes,
        qualityName: arrStatusCache.qualityName,
        serverName: arrServers.name,
      })
      .from(arrStatusCache)
      .innerJoin(
        titles,
        and(
          eq(titles.tmdbId, arrStatusCache.externalId),
          // Radarr rows are movies, Sonarr rows are series.
          eq(titles.mediaType, sql`case when ${arrStatusCache.provider} = 'radarr' then 'movie' else 'tv' end`),
        ),
      )
      .leftJoin(arrServers, eq(arrServers.id, arrStatusCache.serverId))
      .where(eq(arrStatusCache.userId, userId)),
    db.select({ id: plexServers.id, name: plexServers.name }).from(plexServers).where(eq(plexServers.userId, userId)),
    db
      .select({ id: jellyfinServers.id, name: jellyfinServers.name, product: jellyfinServers.product })
      .from(jellyfinServers)
      .where(eq(jellyfinServers.userId, userId)),
  ]);

  for (const row of arrRows) {
    // Only what's actually on disk can be a duplicate file.
    if (arrRowStatus(row.status, row.monitored) !== "owned" && !row.filePath) continue;
    add(row.title, {
      source: row.provider,
      server: row.serverName ?? (row.provider === "radarr" ? "Radarr" : "Sonarr"),
      filePath: row.filePath,
      sizeBytes: row.sizeBytes,
      quality: row.qualityName,
    });
  }

  if (plexServerRows.length > 0) {
    const names = new Map(plexServerRows.map((s) => [s.id, s.name]));
    const rows = await db
      .select({
        title: titleColumns,
        serverId: plexLibraryItems.plexServerId,
        filePath: plexLibraryItems.filePath,
        sizeBytes: plexLibraryItems.sizeBytes,
        resolution: plexLibraryItems.resolution,
      })
      .from(plexLibraryItems)
      .innerJoin(
        titles,
        and(eq(titles.mediaType, plexLibraryItems.mediaType), eq(titles.tmdbId, plexLibraryItems.tmdbId)),
      )
      .where(inArray(plexLibraryItems.plexServerId, [...names.keys()]));
    for (const row of rows) {
      add(row.title, {
        source: "plex",
        server: names.get(row.serverId) ?? "Plex",
        filePath: row.filePath,
        sizeBytes: row.sizeBytes,
        quality: row.resolution,
      });
    }
  }

  if (jellyfinServerRows.length > 0) {
    const names = new Map(
      jellyfinServerRows.map((s) => [s.id, s.name ?? (s.product === "emby" ? "Emby" : "Jellyfin")]),
    );
    const rows = await db
      .select({
        title: titleColumns,
        serverId: jellyfinLibraryItems.jellyfinServerId,
        filePath: jellyfinLibraryItems.filePath,
        sizeBytes: jellyfinLibraryItems.sizeBytes,
        resolution: jellyfinLibraryItems.resolution,
      })
      .from(jellyfinLibraryItems)
      .innerJoin(
        titles,
        and(eq(titles.mediaType, jellyfinLibraryItems.mediaType), eq(titles.tmdbId, jellyfinLibraryItems.tmdbId)),
      )
      .where(inArray(jellyfinLibraryItems.jellyfinServerId, [...names.keys()]));
    for (const row of rows) {
      add(row.title, {
        source: "jellyfin",
        server: names.get(row.serverId) ?? "Jellyfin",
        filePath: row.filePath,
        sizeBytes: row.sizeBytes,
        quality: row.resolution,
      });
    }
  }

  const groups = [...byKey.values()].map(({ title, copies }) => ({
    mediaType: title.mediaType,
    tmdbId: title.tmdbId,
    name: title.name,
    posterPath: title.posterPath,
    year: toYear(title),
    copies,
  }));
  return findDuplicates(groups).sort((a, b) => a.name.localeCompare(b.name) || a.tmdbId - b.tmdbId);
}
