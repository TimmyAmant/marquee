import { and, desc, eq, gt, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { singleFlight } from "@/lib/async/single-flight";
import { plexServers, plexLibraryItems, integrationCredentials } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { getPlexCredential } from "@/lib/integrations/credentials";
import * as plex from "@/lib/plex/client";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { resolveTmdbIdFromTvdbId } from "@/lib/tmdb/cross-reference";
import { applyTmdbIdOverride } from "@/lib/library/title-overrides";
import { EMPTY_MEDIA_DETAIL, mergeMediaDetail } from "@/lib/media-info";
import type { MediaDetail } from "@/lib/media-info";
import { mapWithLimit } from "@/lib/async/map-limit";
import { rowsMissingFromSync } from "@/lib/library/prune";

/** How many shows' episode listings to fetch from Plex at once. */
const SHOW_FETCH_CONCURRENCY = 6;

async function runSyncPlexLibrary(userId: string): Promise<{ serverCount: number; itemCount: number }> {
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

    // Every rating key this run saw on this server. Once every section has
    // been listed in full, anything stored that isn't in here was deleted
    // from Plex and gets removed below — otherwise a deleted title would
    // keep showing "In library" forever.
    const seenRatingKeys = new Set<string>();
    let listedEverySection = true;

    for (const section of sections) {
      if (section.type !== "movie" && section.type !== "show") continue;
      const mediaType = section.type === "movie" ? "movie" : "tv";

      let items: plex.PlexMetadataItem[];
      try {
        items = await plex.getSectionItems(serverUri, credential.authToken, section.key);
      } catch {
        listedEverySection = false;
        continue;
      }

      // TV shows need one extra request per item (Plex only reports
      // Media/Part on individual episodes, not the show itself) — fetch
      // those a few at a time rather than one by one in the loop below, or
      // sync time would scale with the number of shows in the library. A
      // small cap keeps a big library from firing a thousand requests at
      // the Plex server in the same instant.
      const sizeByRatingKey = new Map<string, number | null>();
      const folderPathByRatingKey = new Map<string, string | null>();
      const detailByRatingKey = new Map<string, MediaDetail>();
      await mapWithLimit(
        items,
        mediaType === "movie" ? items.length : SHOW_FETCH_CONCURRENCY,
        async (item) => {
          if (mediaType === "movie") {
            sizeByRatingKey.set(item.ratingKey, plex.getFileSize(item));
            // Resolution, codecs, container and bitrate all ride along on the
            // section listing already fetched above — free.
            detailByRatingKey.set(item.ratingKey, plex.parseMediaDetail(item));
            return;
          }
          const info = await plex
            .getShowFileInfo(serverUri, credential.authToken, item.ratingKey)
            .catch(() => ({ sizeBytes: null, folderPath: null, detail: { ...EMPTY_MEDIA_DETAIL } }));
          sizeByRatingKey.set(item.ratingKey, info.sizeBytes);
          folderPathByRatingKey.set(item.ratingKey, info.folderPath);
          detailByRatingKey.set(item.ratingKey, info.detail);
        },
      );

      // Dynamic range is the one field a section listing can't answer: Plex
      // only exposes it on the video stream, and a listing stops at Part. Fill
      // it in with a batched fetch of the items' own metadata — one request
      // per 50 movies, best-effort, so a slow or unhappy server just leaves
      // this field null instead of failing the sync. Shows are skipped: their
      // detail comes from episodes, and streams for those would be one batch
      // per show rather than per library.
      if (mediaType === "movie") {
        const needStreams = items
          .filter((item) => detailByRatingKey.get(item.ratingKey)?.dynamicRange == null)
          .map((item) => item.ratingKey);
        const streamDetails = await plex
          .getMediaDetailsByRatingKeys(serverUri, credential.authToken, needStreams)
          .catch(() => new Map<string, MediaDetail>());
        for (const [ratingKey, streamDetail] of streamDetails) {
          // The fetched metadata is a superset of the listing entry — same
          // Media attributes, plus the streams — so it leads, and the listing
          // only covers a batch that came back thinner than expected. It
          // matters for more than dynamic range: "TrueHD Atmos" is only
          // visible once the audio stream's profile/title is in hand, where
          // the listing's bare `audioCodec` says just "truehd".
          const listingDetail = detailByRatingKey.get(ratingKey) ?? { ...EMPTY_MEDIA_DETAIL };
          detailByRatingKey.set(ratingKey, mergeMediaDetail(streamDetail, listingDetail));
        }
      }

      for (const item of items) {
        seenRatingKeys.add(item.ratingKey);
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
        const detail = detailByRatingKey.get(item.ratingKey) ?? { ...EMPTY_MEDIA_DETAIL };
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
            ...detail,
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
              ...detail,
              viewCount,
              lastViewedAt,
            },
          });
        itemCount++;
      }
    }

    if (listedEverySection) {
      const stored = await db
        .select({ id: plexLibraryItems.id, key: plexLibraryItems.ratingKey })
        .from(plexLibraryItems)
        .where(eq(plexLibraryItems.plexServerId, serverRow.id));
      const gone = rowsMissingFromSync(stored, seenRatingKeys);
      for (let i = 0; i < gone.length; i += 500) {
        await db.delete(plexLibraryItems).where(inArray(plexLibraryItems.id, gone.slice(i, i + 500)));
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

export type PlexFileInfo = {
  path: string | null;
  sizeBytes: number | null;
  addedAt: Date | null;
} & MediaDetail;

/**
 * Returns file info when this title is in Plex, null otherwise — replaces
 * a plain boolean check since the title page wants to show location/size
 * for Plex-owned titles too, not just Radarr/Sonarr ones. For TV, `path` is
 * the shared folder derived across all episode files at sync time (see the
 * comment in syncPlexLibrary above), not any single episode's own file.
 */
export async function getPlexFileInfo(
  userId: string,
  mediaType: MediaType,
  tmdbId: number,
  tvdbId: number | null,
): Promise<PlexFileInfo | null> {
  const servers = await db
    .select({ id: plexServers.id })
    .from(plexServers)
    .where(eq(plexServers.userId, userId));

  if (servers.length === 0) return null;
  const serverIds = servers.map((s) => s.id);

  // Scoped to the media type: TMDb numbers movies and shows separately, so
  // the same id can be a film on one side and a series on the other, and a
  // movie page must not light up as owned because of a show.
  const idMatch = and(
    eq(plexLibraryItems.mediaType, mediaType),
    tvdbId
      ? or(eq(plexLibraryItems.tmdbId, tmdbId), eq(plexLibraryItems.tvdbId, tvdbId))
      : eq(plexLibraryItems.tmdbId, tmdbId),
  );

  const [match] = await db
    .select({
      filePath: plexLibraryItems.filePath,
      sizeBytes: plexLibraryItems.sizeBytes,
      addedAt: plexLibraryItems.addedAt,
      resolution: plexLibraryItems.resolution,
      videoCodec: plexLibraryItems.videoCodec,
      dynamicRange: plexLibraryItems.dynamicRange,
      audioCodec: plexLibraryItems.audioCodec,
      audioChannels: plexLibraryItems.audioChannels,
      container: plexLibraryItems.container,
      bitrateKbps: plexLibraryItems.bitrateKbps,
    })
    .from(plexLibraryItems)
    .where(and(inArray(plexLibraryItems.plexServerId, serverIds), idMatch))
    .limit(1);

  if (!match) return null;
  const { filePath, ...detail } = match;
  return { ...detail, path: filePath };
}

/** One Plex sync per user at a time — a second caller while one is running
 * shares its result instead of starting another. */
export function syncPlexLibrary(userId: string) {
  return singleFlight(`plex-sync:${userId}`, () => runSyncPlexLibrary(userId));
}
