import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { jellyfinServers, jellyfinLibraryItems, integrationCredentials } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { getJellyfinCredential } from "@/lib/integrations/credentials";
import * as jellyfin from "@/lib/jellyfin/client";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { resolveTmdbIdFromTvdbId } from "@/lib/tmdb/cross-reference";

export async function syncJellyfinLibrary(
  userId: string,
): Promise<{ itemCount: number }> {
  const credential = await getJellyfinCredential(userId);
  if (!credential) throw new Error("Jellyfin is not connected for this user");

  const info = await jellyfin.testConnection(credential);

  const [serverRow] = await db
    .insert(jellyfinServers)
    .values({
      userId,
      serverId: info.Id,
      name: info.ServerName,
      lastSyncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [jellyfinServers.userId, jellyfinServers.serverId],
      set: { name: info.ServerName, lastSyncedAt: new Date() },
    })
    .returning();

  const items = await jellyfin.getLibraryItems(credential);
  let itemCount = 0;

  for (const item of items) {
    if (item.Type !== "Movie" && item.Type !== "Series") continue;
    const mediaType: MediaType = item.Type === "Movie" ? "movie" : "tv";

    const parsed = jellyfin.parseExternalIds(item);
    let { tmdbId } = parsed;
    const { tvdbId, imdbId } = parsed;

    if (!tmdbId && mediaType === "tv" && tvdbId) {
      tmdbId = await resolveTmdbIdFromTvdbId(tvdbId).catch(() => null);
    }

    if (tmdbId) {
      await getOrFetchTitle(mediaType, tmdbId).catch(() => undefined);
    }

    // Jellyfin only reports file size on the movie's own entry — a show's
    // size is per-episode, not aggregated on the series entry the way
    // Plex's "all leaves" endpoint lets us sum it. Scoped out for v1 (same
    // known-gap tradeoff as this app already accepts for other cases).
    const sizeBytes = mediaType === "movie" ? jellyfin.getFileSize(item) : null;

    await db
      .insert(jellyfinLibraryItems)
      .values({
        jellyfinServerId: serverRow.id,
        itemId: item.Id,
        mediaType,
        tmdbId,
        tvdbId,
        imdbId,
        title: item.Name,
        addedAt: item.DateCreated ? new Date(item.DateCreated) : null,
        sizeBytes,
        filePath: item.Path ?? null,
      })
      .onConflictDoUpdate({
        target: [jellyfinLibraryItems.jellyfinServerId, jellyfinLibraryItems.itemId],
        set: {
          mediaType,
          tmdbId,
          tvdbId,
          imdbId,
          title: item.Name,
          addedAt: item.DateCreated ? new Date(item.DateCreated) : null,
          sizeBytes,
          filePath: item.Path ?? null,
        },
      });
    itemCount++;
  }

  return { itemCount };
}

export async function getJellyfinSummary(userId: string): Promise<{
  connected: boolean;
  servers: { name: string | null; lastSyncedAt: Date | null }[];
  movieCount: number;
  tvCount: number;
  totalBytes: number;
}> {
  const servers = await db
    .select({ id: jellyfinServers.id, name: jellyfinServers.name, lastSyncedAt: jellyfinServers.lastSyncedAt })
    .from(jellyfinServers)
    .where(eq(jellyfinServers.userId, userId));

  if (servers.length === 0) {
    const credential = await getJellyfinCredential(userId);
    return { connected: Boolean(credential), servers: [], movieCount: 0, tvCount: 0, totalBytes: 0 };
  }

  const items = await db
    .select({
      id: jellyfinLibraryItems.id,
      mediaType: jellyfinLibraryItems.mediaType,
      sizeBytes: jellyfinLibraryItems.sizeBytes,
    })
    .from(jellyfinLibraryItems)
    .where(
      inArray(
        jellyfinLibraryItems.jellyfinServerId,
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

export async function syncJellyfinLibraryIfStale(userId: string): Promise<void> {
  const [server] = await db
    .select({ lastSyncedAt: jellyfinServers.lastSyncedAt })
    .from(jellyfinServers)
    .where(eq(jellyfinServers.userId, userId))
    .limit(1);

  const isStale =
    !server?.lastSyncedAt || Date.now() - server.lastSyncedAt.getTime() > AUTO_SYNC_STALE_MS;

  if (isStale) {
    await syncJellyfinLibrary(userId).catch(() => undefined);
  }
}

export async function syncAllConnectedJellyfinUsers(): Promise<void> {
  const rows = await db
    .selectDistinct({ userId: integrationCredentials.userId })
    .from(integrationCredentials)
    .where(eq(integrationCredentials.provider, "jellyfin"));

  for (const row of rows) {
    await syncJellyfinLibrary(row.userId).catch((err) => {
      console.error(`[jellyfin-sync] failed for user ${row.userId}:`, err);
    });
  }
}

export async function isTitleInJellyfinLibrary(
  userId: string,
  tmdbId: number,
  tvdbId: number | null,
): Promise<boolean> {
  const servers = await db
    .select({ id: jellyfinServers.id })
    .from(jellyfinServers)
    .where(eq(jellyfinServers.userId, userId));

  if (servers.length === 0) return false;
  const serverIds = servers.map((s) => s.id);

  const idMatch = tvdbId
    ? or(eq(jellyfinLibraryItems.tmdbId, tmdbId), eq(jellyfinLibraryItems.tvdbId, tvdbId))
    : eq(jellyfinLibraryItems.tmdbId, tmdbId);

  const [match] = await db
    .select({ id: jellyfinLibraryItems.id })
    .from(jellyfinLibraryItems)
    .where(and(inArray(jellyfinLibraryItems.jellyfinServerId, serverIds), idMatch))
    .limit(1);

  return Boolean(match);
}
