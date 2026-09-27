import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { jellyfinLibraryItems, jellyfinServers, plexLibraryItems, plexServers, type MediaType } from "@/lib/db/schema";
import { getJellyfinCredential } from "@/lib/integrations/credentials";
import type { PlayableItem } from "@/lib/media-servers/play-links";

/**
 * Where a title can be played: every synced Plex/Jellyfin/Emby library item
 * of the household's media servers (lib/plex/sync.ts, lib/jellyfin/sync.ts)
 * matching the title by TMDb id, or by TVDB id for a show (a Plex show is
 * often matched by TVDB only). The owner is the library owner
 * (lib/integrations/library-owner.ts).
 */
export async function getPlayableItems(
  libraryOwnerId: string,
  mediaType: MediaType,
  tmdbId: number,
  tvdbId: number | null,
): Promise<PlayableItem[]> {
  const [plexRows, jellyfin] = await Promise.all([findPlex(), findJellyfin()]);
  return [...plexRows, ...jellyfin];

  async function findPlex(): Promise<PlayableItem[]> {
    const servers = await db
      .select({ id: plexServers.id, machineIdentifier: plexServers.machineIdentifier, name: plexServers.name })
      .from(plexServers)
      .where(eq(plexServers.userId, libraryOwnerId));
    if (servers.length === 0) return [];
    const byId = new Map(servers.map((s) => [s.id, s]));
    const idMatch =
      mediaType === "tv" && tvdbId
        ? or(eq(plexLibraryItems.tmdbId, tmdbId), eq(plexLibraryItems.tvdbId, tvdbId))
        : eq(plexLibraryItems.tmdbId, tmdbId);
    const rows = await db
      .select({ serverId: plexLibraryItems.plexServerId, ratingKey: plexLibraryItems.ratingKey })
      .from(plexLibraryItems)
      .where(
        and(
          inArray(
            plexLibraryItems.plexServerId,
            servers.map((s) => s.id),
          ),
          eq(plexLibraryItems.mediaType, mediaType),
          idMatch,
        ),
      );
    return rows.map((row) => {
      const server = byId.get(row.serverId)!;
      return { server: "plex", machineIdentifier: server.machineIdentifier, ratingKey: row.ratingKey, serverName: server.name };
    });
  }

  async function findJellyfin(): Promise<PlayableItem[]> {
    const credential = await getJellyfinCredential(libraryOwnerId);
    if (!credential) return [];
    const servers = await db
      .select({
        id: jellyfinServers.id,
        serverId: jellyfinServers.serverId,
        name: jellyfinServers.name,
        product: jellyfinServers.product,
      })
      .from(jellyfinServers)
      .where(eq(jellyfinServers.userId, libraryOwnerId));
    if (servers.length === 0) return [];
    const byId = new Map(servers.map((s) => [s.id, s]));
    const idMatch =
      mediaType === "tv" && tvdbId
        ? or(eq(jellyfinLibraryItems.tmdbId, tmdbId), eq(jellyfinLibraryItems.tvdbId, tvdbId))
        : eq(jellyfinLibraryItems.tmdbId, tmdbId);
    const rows = await db
      .select({ serverId: jellyfinLibraryItems.jellyfinServerId, itemId: jellyfinLibraryItems.itemId })
      .from(jellyfinLibraryItems)
      .where(
        and(
          inArray(
            jellyfinLibraryItems.jellyfinServerId,
            servers.map((s) => s.id),
          ),
          eq(jellyfinLibraryItems.mediaType, mediaType),
          idMatch,
        ),
      );
    const url = credential.publicUrl ?? credential.baseUrl;
    return rows.map((row) => {
      const server = byId.get(row.serverId)!;
      return {
        server: server.product === "emby" ? "emby" : "jellyfin",
        url,
        itemId: row.itemId,
        serverId: server.serverId,
        serverName: server.name,
      };
    });
  }
}
