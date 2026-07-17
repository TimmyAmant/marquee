import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { plexServers, plexLibraryItems, arrStatusCache, titles } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import type { LibraryStatus } from "@/components/status-badge";

export type LibraryItem = {
  titleId: string;
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  year: string | null;
  status: LibraryStatus;
  source: "plex" | "sonarr" | "radarr";
  sizeBytes: number | null;
  addedAt: Date | null;
  monitored: boolean | null;
  filePath: string | null;
  /** Radarr-only for now — true when the owned file is below the
   * configured quality cutoff (an upgrade is expected/possible). */
  qualityCutoffNotMet: boolean;
};

function toYear(row: { releaseDate: string | null; firstAirDate: string | null }): string | null {
  return (row.releaseDate || row.firstAirDate || "").slice(0, 4) || null;
}

/**
 * An arr-sourced row only stops counting as "in the library" once it was
 * never downloaded at all (still just monitored, no files) and monitoring
 * was turned off — either via Marquee's "Stop monitoring" button or directly
 * in Sonarr/Radarr. Anything with a real file on disk (`owned` or partially
 * `tracked_downloading`) stays visible regardless of the monitored flag.
 *
 * `deriveRadarrStatus`/`deriveSonarrStatus` now write "untracked" directly
 * for this case going forward, but older cached rows synced before that fix
 * still have the pre-fix shape (`tracked_monitored` + `monitored: false`) —
 * treat both as dropped so already-cached rows self-heal without a re-sync.
 */
function isDroppedArrRow(status: string | null, monitored: boolean | null): boolean {
  return status === "untracked" || (status === "tracked_monitored" && monitored === false);
}

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

  for (const { title, status, sizeBytes, monitored, filePath, qualityCutoffNotMet } of radarrRows) {
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
      });
    }
  }

  return Array.from(byKey.values());
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

  return map;
}
