import { and, desc, eq, gt, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { plexServers, plexLibraryItems, integrationCredentials } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { getPlexCredential } from "@/lib/integrations/credentials";
import * as plex from "@/lib/plex/client";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { resolveTmdbIdFromTvdbId } from "@/lib/tmdb/cross-reference";
import { applyTmdbIdOverride } from "@/lib/library/title-overrides";

export async function syncPlexLibrary(userId: string): Promise<{ serverCount: number; itemCount: number }> {
  const credential = await getPlexCredential(userId);
  if (!credential) throw new Error("Plex is not connected for this user");

  const resources = await plex.getResources(credential.clientId, credential.authToken);
  let itemCount = 0;

  for (const resource of resources) {
    const serverUri = plex.pickBestConnection(resource.connections);
    if (!serverUri) continue;

    const [serverRow] = await db
      .insert(plexServers)
      .values({
        userId,
        machineIdentifier: resource.clientIdentifier,
        name: resource.name,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [plexServers.userId, plexServers.machineIdentifier],
        set: { name: resource.name, lastSyncedAt: new Date() },
      })
      .returning();

    let sections: plex.PlexLibrarySection[];
    try {
      sections = await plex.getLibrarySections(serverUri, credential.authToken);
    } catch {
      continue;
    }

    for (const section of sections) {
      if (section.type !== "movie" && section.type !== "show") continue;
      const mediaType = section.type === "movie" ? "movie" : "tv";

      let items: plex.PlexMetadataItem[];
      try {
        items = await plex.getSectionItems(serverUri, credential.authToken, section.key);
      } catch {
        continue;
      }

      // TV shows need one extra request per item (Plex only reports
      // Media/Part on individual episodes, not the show itself) — fetch
      // those concurrently rather than one at a time in the loop below, or
      // sync time would scale with the number of shows in the library.
      const sizeByRatingKey = new Map<string, number | null>();
      const folderPathByRatingKey = new Map<string, string | null>();
      await Promise.all(
        items.map(async (item) => {
          if (mediaType === "movie") {
            sizeByRatingKey.set(item.ratingKey, plex.getFileSize(item));
            return;
          }
          const info = await plex
            .getShowFileInfo(serverUri, credential.authToken, item.ratingKey)
            .catch(() => ({ sizeBytes: null, folderPath: null }));
          sizeByRatingKey.set(item.ratingKey, info.sizeBytes);
          folderPathByRatingKey.set(item.ratingKey, info.folderPath);
        }),
      );

      for (const item of items) {
        const parsed = plex.parseExternalIds(item);
        let { tmdbId } = parsed;
        const { tvdbId, imdbId } = parsed;

        if (!tmdbId && mediaType === "tv" && tvdbId) {
          tmdbId = await resolveTmdbIdFromTvdbId(tvdbId).catch(() => null);
        }
        if (tmdbId) {
          tmdbId = await applyTmdbIdOverride(userId, mediaType, tmdbId).catch(() => tmdbId);
        }

        if (tmdbId) {
          await getOrFetchTitle(mediaType, tmdbId).catch(() => undefined);
        }

        const sizeBytes = sizeByRatingKey.get(item.ratingKey) ?? null;
        // A movie's own entry carries its one Media/Part directly. A show
        // has no single file of its own — filePath here is the folder every
        // episode's file has in common, derived from the same per-episode
        // fetch used for size above (falls back to Sonarr's series path in
        // the library merge on the rare sync where this comes back null).
        const filePath =
          mediaType === "movie" ? plex.getFilePath(item) : (folderPathByRatingKey.get(item.ratingKey) ?? null);
        const viewCount = item.viewCount ?? null;
        const lastViewedAt = item.lastViewedAt ? new Date(item.lastViewedAt * 1000) : null;

        await db
          .insert(plexLibraryItems)
          .values({
            plexServerId: serverRow.id,
            ratingKey: item.ratingKey,
            mediaType,
            guid: item.guid ?? null,
            tmdbId,
            tvdbId,
            imdbId,
            title: item.title,
            addedAt: item.addedAt ? new Date(item.addedAt * 1000) : null,
            sizeBytes,
            filePath,
            viewCount,
            lastViewedAt,
          })
          .onConflictDoUpdate({
            target: [plexLibraryItems.plexServerId, plexLibraryItems.ratingKey],
            set: {
              mediaType,
              guid: item.guid ?? null,
              tmdbId,
              tvdbId,
              imdbId,
              title: item.title,
              addedAt: item.addedAt ? new Date(item.addedAt * 1000) : null,
              sizeBytes,
              filePath,
              viewCount,
              lastViewedAt,
            },
          });
        itemCount++;
      }
    }
  }

  return { serverCount: resources.length, itemCount };
}

export async function getPlexSummary(userId: string): Promise<{
  connected: boolean;
  servers: { name: string | null; lastSyncedAt: Date | null }[];
  movieCount: number;
  tvCount: number;
  totalBytes: number;
}> {
  const servers = await db
    .select({ id: plexServers.id, name: plexServers.name, lastSyncedAt: plexServers.lastSyncedAt })
    .from(plexServers)
    .where(eq(plexServers.userId, userId));

  if (servers.length === 0) {
    const credential = await getPlexCredential(userId);
    return { connected: Boolean(credential), servers: [], movieCount: 0, tvCount: 0, totalBytes: 0 };
  }

  const items = await db
    .select({
      id: plexLibraryItems.id,
      mediaType: plexLibraryItems.mediaType,
      sizeBytes: plexLibraryItems.sizeBytes,
    })
    .from(plexLibraryItems)
    .where(
      inArray(
        plexLibraryItems.plexServerId,
        servers.map((s) => s.id),
      ),
    );

  return {
    connected: true,
    servers: servers.map((s) => ({ name: s.name, lastSyncedAt: s.lastSyncedAt })),
    movieCount: items.filter((i) => i.mediaType === "movie").length,
    tvCount: items.filter((i) => i.mediaType === "tv").length,
    totalBytes: items.reduce((sum, i) => sum + (i.sizeBytes ?? 0), 0),
  };
}

const AUTO_SYNC_STALE_MS = 15 * 60 * 1000;

export async function syncPlexLibraryIfStale(userId: string): Promise<void> {
  const [server] = await db
    .select({ lastSyncedAt: plexServers.lastSyncedAt })
    .from(plexServers)
    .where(eq(plexServers.userId, userId))
    .limit(1);

  const isStale =
    !server?.lastSyncedAt || Date.now() - server.lastSyncedAt.getTime() > AUTO_SYNC_STALE_MS;

  if (isStale) {
    await syncPlexLibrary(userId).catch(() => undefined);
  }
}

export async function syncAllConnectedPlexUsers(): Promise<void> {
  const rows = await db
    .selectDistinct({ userId: integrationCredentials.userId })
    .from(integrationCredentials)
    .where(eq(integrationCredentials.provider, "plex"));

  for (const row of rows) {
    await syncPlexLibrary(row.userId).catch((err) => {
      console.error(`[plex-sync] failed for user ${row.userId}:`, err);
    });
  }
}

/** Most recently watched titles with at least one full view — seeds the
 * "Because you watched" row on Discover. */
export async function getRecentlyWatched(
  userId: string,
  limit = 5,
): Promise<{ mediaType: MediaType; tmdbId: number }[]> {
  const servers = await db
    .select({ id: plexServers.id })
    .from(plexServers)
    .where(eq(plexServers.userId, userId));
  if (servers.length === 0) return [];

  const rows = await db
    .select({ mediaType: plexLibraryItems.mediaType, tmdbId: plexLibraryItems.tmdbId })
    .from(plexLibraryItems)
    .where(
      and(
        inArray(plexLibraryItems.plexServerId, servers.map((s) => s.id)),
        gt(plexLibraryItems.viewCount, 0),
        isNotNull(plexLibraryItems.tmdbId),
      ),
    )
    .orderBy(desc(plexLibraryItems.lastViewedAt))
    .limit(limit);

  return rows
    .filter((r): r is { mediaType: MediaType; tmdbId: number } => r.tmdbId != null)
    .map((r) => ({ mediaType: r.mediaType, tmdbId: r.tmdbId }));
}

export type PlexFileInfo = { path: string | null; sizeBytes: number | null; addedAt: Date | null };

/**
 * Returns file info when this title is in Plex, null otherwise — replaces
 * a plain boolean check since the title page wants to show location/size
 * for Plex-owned titles too, not just Radarr/Sonarr ones. For TV, `path` is
 * the shared folder derived across all episode files at sync time (see the
 * comment in syncPlexLibrary above), not any single episode's own file.
 */
export async function getPlexFileInfo(
  userId: string,
  tmdbId: number,
  tvdbId: number | null,
): Promise<PlexFileInfo | null> {
  const servers = await db
    .select({ id: plexServers.id })
    .from(plexServers)
    .where(eq(plexServers.userId, userId));

  if (servers.length === 0) return null;
  const serverIds = servers.map((s) => s.id);

  const idMatch = tvdbId
    ? or(eq(plexLibraryItems.tmdbId, tmdbId), eq(plexLibraryItems.tvdbId, tvdbId))
    : eq(plexLibraryItems.tmdbId, tmdbId);

  const [match] = await db
    .select({
      filePath: plexLibraryItems.filePath,
      sizeBytes: plexLibraryItems.sizeBytes,
      addedAt: plexLibraryItems.addedAt,
    })
    .from(plexLibraryItems)
    .where(and(inArray(plexLibraryItems.plexServerId, serverIds), idMatch))
    .limit(1);

  if (!match) return null;
  return { path: match.filePath, sizeBytes: match.sizeBytes, addedAt: match.addedAt };
}
