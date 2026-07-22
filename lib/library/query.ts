import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  plexServers,
  plexLibraryItems,
  jellyfinServers,
  jellyfinLibraryItems,
  arrStatusCache,
  titles,
} from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import type { LibraryStatus } from "@/components/status-badge";
import { toYear, isDroppedArrRow, isPossibleDuplicate } from "@/lib/library/query-policy";

export type LibraryItem = {
  titleId: string;
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  year: string | null;
  status: LibraryStatus;
  source: "plex" | "jellyfin" | "sonarr" | "radarr";
  sizeBytes: number | null;
  addedAt: Date | null;
  monitored: boolean | null;
  filePath: string | null;
  /** Radarr-only for now — true when the owned file is below the
   * configured quality cutoff (an upgrade is expected/possible). */
  qualityCutoffNotMet: boolean;
  /** Radarr's quality profile name for the file on disk (e.g.
   * "Bluray-1080p") — resolution badges are derived from this string.
   * Radarr-only for now, same gap as qualityCutoffNotMet above. */
  qualityName: string | null;
  /** Radarr-only, same gap as qualityName above. */
  dynamicRange: string | null;
  audioCodec: string | null;
  /** True when an arr app and a media server both report a file path for
   * this title and the paths don't match — a strong signal there are two
   * separate files on disk (e.g. a stale lower-quality grab left behind
   * after an upgrade). Both paths are kept so the UI can show them. */
  possibleDuplicate: boolean;
  otherFilePath: string | null;
};

export async function getUserLibrary(userId: string): Promise<LibraryItem[]> {
  const byKey = new Map<string, LibraryItem>();

  const [radarrRows, sonarrRows] = await Promise.all([
    db
      .select({
        title: titles,
        status: arrStatusCache.status,
        sizeBytes: arrStatusCache.sizeBytes,
        monitored: arrStatusCache.monitored,
        filePath: arrStatusCache.filePath,
        qualityCutoffNotMet: arrStatusCache.qualityCutoffNotMet,
        qualityName: arrStatusCache.qualityName,
        dynamicRange: arrStatusCache.dynamicRange,
        audioCodec: arrStatusCache.audioCodec,
      })
      .from(arrStatusCache)
      .innerJoin(titles, and(eq(titles.mediaType, "movie"), eq(titles.tmdbId, arrStatusCache.externalId)))
      .where(and(eq(arrStatusCache.userId, userId), eq(arrStatusCache.provider, "radarr"))),
    db
      .select({
        title: titles,
        status: arrStatusCache.status,
        sizeBytes: arrStatusCache.sizeBytes,
        monitored: arrStatusCache.monitored,
        filePath: arrStatusCache.filePath,
      })
      .from(arrStatusCache)
      .innerJoin(titles, and(eq(titles.mediaType, "tv"), eq(titles.tmdbId, arrStatusCache.externalId)))
      .where(and(eq(arrStatusCache.userId, userId), eq(arrStatusCache.provider, "sonarr"))),
  ]);

  for (const {
    title,
    status,
    sizeBytes,
    monitored,
    filePath,
    qualityCutoffNotMet,
    qualityName,
    dynamicRange,
    audioCodec,
  } of radarrRows) {
    if (isDroppedArrRow(status, monitored)) continue;

    const key = `${title.mediaType}:${title.tmdbId}`;
    byKey.set(key, {
      titleId: title.id,
      mediaType: title.mediaType,
      tmdbId: title.tmdbId,
      name: title.name,
      posterPath: title.posterPath,
      year: toYear(title),
      status: (status as LibraryStatus) ?? "tracked_monitored",
      source: "radarr",
      sizeBytes,
      addedAt: null,
      monitored,
      filePath,
      qualityCutoffNotMet: qualityCutoffNotMet ?? false,
      qualityName,
      dynamicRange,
      audioCodec,
      possibleDuplicate: false,
      otherFilePath: null,
    });
  }

  for (const { title, status, sizeBytes, monitored, filePath } of sonarrRows) {
    if (isDroppedArrRow(status, monitored)) continue;

    const key = `${title.mediaType}:${title.tmdbId}`;
    byKey.set(key, {
      titleId: title.id,
      mediaType: title.mediaType,
      tmdbId: title.tmdbId,
      name: title.name,
      posterPath: title.posterPath,
      year: toYear(title),
      status: (status as LibraryStatus) ?? "tracked_monitored",
      source: "sonarr",
      sizeBytes,
      addedAt: null,
      monitored,
      filePath,
      qualityCutoffNotMet: false,
      qualityName: null,
      dynamicRange: null,
      audioCodec: null,
      possibleDuplicate: false,
      otherFilePath: null,
    });
  }

  const plexServerRows = await db
    .select({ id: plexServers.id })
    .from(plexServers)
    .where(eq(plexServers.userId, userId));
  const plexServerIds = plexServerRows.map((r) => r.id);

  if (plexServerIds.length > 0) {
    const plexRows = await db
      .select({
        title: titles,
        sizeBytes: plexLibraryItems.sizeBytes,
        addedAt: plexLibraryItems.addedAt,
        filePath: plexLibraryItems.filePath,
      })
      .from(plexLibraryItems)
      .innerJoin(
        titles,
        and(eq(titles.mediaType, plexLibraryItems.mediaType), eq(titles.tmdbId, plexLibraryItems.tmdbId)),
      )
      .where(inArray(plexLibraryItems.plexServerId, plexServerIds));

    // Plex takes precedence over "owned"/"monitored" arr entries — but not
    // over an active download: Radarr can be re-grabbing a title Plex
    // already has an (older) file for, and "Downloading" is the more useful
    // status to surface until the new file lands.
    for (const { title, sizeBytes, addedAt, filePath } of plexRows) {
      const key = `${title.mediaType}:${title.tmdbId}`;
      const existing = byKey.get(key);
      if (existing?.status === "tracked_downloading") {
        byKey.set(key, { ...existing, sizeBytes, addedAt });
        continue;
      }
      byKey.set(key, {
        titleId: title.id,
        mediaType: title.mediaType,
        tmdbId: title.tmdbId,
        name: title.name,
        posterPath: title.posterPath,
        year: toYear(title),
        status: "owned",
        source: "plex",
        sizeBytes,
        addedAt,
        monitored: null,
        // Plex only carries a single file path for movies (a show has one
        // per episode, not one for the whole series) — fall back to
        // whatever Sonarr already had cached for this title, if any.
        filePath: filePath ?? existing?.filePath ?? null,
        // Plex has no notion of quality cutoffs — carry over whatever
        // Radarr already determined for this title, if any.
        qualityCutoffNotMet: existing?.qualityCutoffNotMet ?? false,
        qualityName: existing?.qualityName ?? null,
        dynamicRange: existing?.dynamicRange ?? null,
        audioCodec: existing?.audioCodec ?? null,
        possibleDuplicate: isPossibleDuplicate(existing?.filePath ?? null, filePath),
        otherFilePath: isPossibleDuplicate(existing?.filePath ?? null, filePath)
          ? existing!.filePath
          : null,
      });
    }
  }

  const jellyfinServerRows = await db
    .select({ id: jellyfinServers.id })
    .from(jellyfinServers)
    .where(eq(jellyfinServers.userId, userId));
  const jellyfinServerIds = jellyfinServerRows.map((r) => r.id);

  if (jellyfinServerIds.length > 0) {
    const jellyfinRows = await db
      .select({
        title: titles,
        sizeBytes: jellyfinLibraryItems.sizeBytes,
        addedAt: jellyfinLibraryItems.addedAt,
        filePath: jellyfinLibraryItems.filePath,
      })
      .from(jellyfinLibraryItems)
      .innerJoin(
        titles,
        and(
          eq(titles.mediaType, jellyfinLibraryItems.mediaType),
          eq(titles.tmdbId, jellyfinLibraryItems.tmdbId),
        ),
      )
      .where(inArray(jellyfinLibraryItems.jellyfinServerId, jellyfinServerIds));

    // Same precedence rule as the Plex merge above — an active download
    // still wins over "owned" from a media-server sync.
    for (const { title, sizeBytes, addedAt, filePath } of jellyfinRows) {
      const key = `${title.mediaType}:${title.tmdbId}`;
      const existing = byKey.get(key);
      if (existing?.status === "tracked_downloading") {
        byKey.set(key, { ...existing, sizeBytes, addedAt });
        continue;
      }
      byKey.set(key, {
        titleId: title.id,
        mediaType: title.mediaType,
        tmdbId: title.tmdbId,
        name: title.name,
        posterPath: title.posterPath,
        year: toYear(title),
        status: "owned",
        source: "jellyfin",
        sizeBytes,
        addedAt,
        monitored: null,
        filePath: filePath ?? existing?.filePath ?? null,
        qualityCutoffNotMet: existing?.qualityCutoffNotMet ?? false,
        qualityName: existing?.qualityName ?? null,
        dynamicRange: existing?.dynamicRange ?? null,
        audioCodec: existing?.audioCodec ?? null,
        possibleDuplicate: isPossibleDuplicate(existing?.filePath ?? null, filePath),
        otherFilePath: isPossibleDuplicate(existing?.filePath ?? null, filePath)
          ? existing!.filePath
          : null,
      });
    }
  }

  return Array.from(byKey.values());
}

export type LibrarySummary = {
  movieCount: number;
  tvCount: number;
  totalBytes: number;
  trackedCount: number;
};

/** Pure summary derivation — split out so a caller that already has the
 * library array can reuse it without a second getUserLibrary query. */
export function summarizeLibrary(library: LibraryItem[]): LibrarySummary {
  const owned = library.filter((i) => i.status === "owned");
  return {
    movieCount: owned.filter((i) => i.mediaType === "movie").length,
    tvCount: owned.filter((i) => i.mediaType === "tv").length,
    totalBytes: owned.reduce((sum, i) => sum + (i.sizeBytes ?? 0), 0),
    trackedCount: library.length - owned.length,
  };
}

/**
 * Most-recently-added owned titles, for Discover's "Recently Added" row —
 * only Plex/Jellyfin-sourced rows carry an addedAt timestamp (arr-only rows
 * don't track one), so anything without it is dropped rather than sorted
 * arbitrarily to one end.
 */
export async function getRecentlyAdded(userId: string, limit = 20): Promise<LibraryItem[]> {
  const library = await getUserLibrary(userId);
  return library
    .filter((item): item is LibraryItem & { addedAt: Date } => item.addedAt !== null)
    .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime())
    .slice(0, limit);
}

/**
 * Local-only bulk ownership lookup for listing pages (homepage rows, search
 * results, Discover). Never calls Sonarr/Radarr/Plex live — reads only what's
 * already synced, so it's cheap to run against a full page of results.
 */
export async function getLibraryStatusMap(
  userId: string,
  items: { mediaType: MediaType; tmdbId: number }[],
): Promise<Map<string, LibraryStatus>> {
  const map = new Map<string, LibraryStatus>();
  if (items.length === 0) return map;

  const movieIds = items.filter((i) => i.mediaType === "movie").map((i) => i.tmdbId);
  const tvIds = items.filter((i) => i.mediaType === "tv").map((i) => i.tmdbId);

  if (movieIds.length > 0) {
    const rows = await db
      .select({
        tmdbId: arrStatusCache.externalId,
        status: arrStatusCache.status,
        monitored: arrStatusCache.monitored,
      })
      .from(arrStatusCache)
      .where(
        and(
          eq(arrStatusCache.userId, userId),
          eq(arrStatusCache.provider, "radarr"),
          inArray(arrStatusCache.externalId, movieIds),
        ),
      );
    for (const row of rows) {
      if (isDroppedArrRow(row.status, row.monitored)) continue;
      map.set(`movie:${row.tmdbId}`, (row.status as LibraryStatus) ?? "tracked_monitored");
    }
  }

  if (tvIds.length > 0) {
    const rows = await db
      .select({
        tmdbId: arrStatusCache.externalId,
        status: arrStatusCache.status,
        monitored: arrStatusCache.monitored,
      })
      .from(arrStatusCache)
      .where(
        and(
          eq(arrStatusCache.userId, userId),
          eq(arrStatusCache.provider, "sonarr"),
          inArray(arrStatusCache.externalId, tvIds),
        ),
      );
    for (const row of rows) {
      if (isDroppedArrRow(row.status, row.monitored)) continue;
      map.set(`tv:${row.tmdbId}`, (row.status as LibraryStatus) ?? "tracked_monitored");
    }
  }

  const plexServerRows = await db
    .select({ id: plexServers.id })
    .from(plexServers)
    .where(eq(plexServers.userId, userId));
  const plexServerIds = plexServerRows.map((r) => r.id);
  const allIds = [...movieIds, ...tvIds];

  if (plexServerIds.length > 0 && allIds.length > 0) {
    const rows = await db
      .select({ mediaType: plexLibraryItems.mediaType, tmdbId: plexLibraryItems.tmdbId })
      .from(plexLibraryItems)
      .where(
        and(
          inArray(plexLibraryItems.plexServerId, plexServerIds),
          inArray(plexLibraryItems.tmdbId, allIds),
        ),
      );
    for (const row of rows) {
      if (row.tmdbId == null) continue;
      const key = `${row.mediaType}:${row.tmdbId}`;
      if (map.get(key) === "tracked_downloading") continue;
      map.set(key, "owned");
    }
  }

  const jellyfinServerRows = await db
    .select({ id: jellyfinServers.id })
    .from(jellyfinServers)
    .where(eq(jellyfinServers.userId, userId));
  const jellyfinServerIds = jellyfinServerRows.map((r) => r.id);

  if (jellyfinServerIds.length > 0 && allIds.length > 0) {
    const rows = await db
      .select({ mediaType: jellyfinLibraryItems.mediaType, tmdbId: jellyfinLibraryItems.tmdbId })
      .from(jellyfinLibraryItems)
      .where(
        and(
          inArray(jellyfinLibraryItems.jellyfinServerId, jellyfinServerIds),
          inArray(jellyfinLibraryItems.tmdbId, allIds),
        ),
      );
    for (const row of rows) {
      if (row.tmdbId == null) continue;
      const key = `${row.mediaType}:${row.tmdbId}`;
      if (map.get(key) === "tracked_downloading") continue;
      map.set(key, "owned");
    }
  }

  return map;
}
