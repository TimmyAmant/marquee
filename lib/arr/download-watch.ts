import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { arrStatusCache, titles } from "@/lib/db/schema";
import type { ArrProvider } from "@/lib/db/schema";
import { arrConfig, listLibraryServers, ownersWithLibraryServers, type ArrServer } from "@/lib/arr/servers";
import { radarrRowFields, sonarrRowFields } from "@/lib/arr/sync";
import type { QueueSummary } from "@/lib/integrations/arr-status-logic";
import { createNotification } from "@/lib/notifications/query";
import { scheduleCompletionCheck } from "@/lib/requests/complete";
import * as radarr from "@/lib/radarr/client";
import * as sonarr from "@/lib/sonarr/client";

// The download watch: once a minute, between the hourly library syncs, the
// titles that are on their way in get a fresh look. Downloads show their
// progress; a finished download Sonarr/Radarr didn't import (a torrent saved
// straight into the client's download folder, say) becomes "Ready to move"
// and the library owner is told once; and once its file has been moved into
// the library by hand it turns Owned and whoever asked for it hears it's
// ready to watch. Only the titles in the queue or already downloading/ready
// are looked at, so a quiet library costs one /queue call per server. A show
// with only some of its episodes on disk is "tracked_downloading" for good;
// unless it's been in the queue it's left to the hourly sync.

/** How often a title waiting to be moved has its folder looked at again. */
const RESCAN_EVERY_MS = 2 * 60 * 1000;
/** …slowing down once it's been waiting a while. */
const RESCAN_SLOW_AFTER_MS = 60 * 60 * 1000;
const RESCAN_SLOW_EVERY_MS = 15 * 60 * 1000;
/** "Ready to move" is told about once per movie in this long… */
const READY_NOTICE_DEDUPE_MS = 30 * 24 * 60 * 60 * 1000;
/** …and once a day per show, whose next episode is new news. */
const READY_NOTICE_DEDUPE_TV_MS = 24 * 60 * 60 * 1000;

const WATCHED: readonly string[] = ["tracked_downloading", "ready_to_move"];

declare global {
  var __marqueeDownloadWatch:
    | { rescannedAt: Map<string, number>; readySince: Map<string, number>; told: Set<string>; queued: Set<string> }
    | undefined;
}

const state = (globalThis.__marqueeDownloadWatch ??= {
  rescannedAt: new Map(),
  readySince: new Map(),
  told: new Set(),
  queued: new Set(),
});
// A state object from before `queued` existed (a dev hot reload).
state.queued ??= new Set();

/** Due for another rescan? Pure apart from the clock it's handed. */
export function rescanDue(now: number, readySince: number, lastRescan: number | undefined): boolean {
  if (lastRescan === undefined) return true;
  const every = now - readySince > RESCAN_SLOW_AFTER_MS ? RESCAN_SLOW_EVERY_MS : RESCAN_EVERY_MS;
  return now - lastRescan >= every;
}

export async function watchDownloads(): Promise<void> {
  for (const kind of ["radarr", "sonarr"] as const) {
    for (const userId of await ownersWithLibraryServers(kind)) {
      await watchOwner(userId, kind).catch((err) => {
        console.error(`[download-watch] ${kind} failed for user ${userId}:`, err);
      });
    }
  }
}

async function watchOwner(userId: string, kind: ArrProvider): Promise<void> {
  const servers = await listLibraryServers(userId, kind);
  if (servers.length === 0) return;

  // A server that doesn't answer leaves its titles as they are.
  const queues = new Map<string, Map<number, QueueSummary>>();
  await Promise.all(
    servers.map(async (server) => {
      const config = arrConfig(server);
      const queue = await (kind === "radarr" ? radarr.getQueueSummaries(config) : sonarr.getQueueSummaries(config)).catch(
        () => null,
      );
      if (queue) queues.set(server.id, queue);
    }),
  );
  const queuedArrIds = [...new Set([...queues.values()].flatMap((q) => [...q.keys()]))];

  const rows = await db
    .select({
      id: arrStatusCache.id,
      tmdbId: arrStatusCache.externalId,
      arrId: arrStatusCache.arrId,
      serverId: arrStatusCache.serverId,
      status: arrStatusCache.status,
      downloadProgress: arrStatusCache.downloadProgress,
    })
    .from(arrStatusCache)
    .where(
      and(
        eq(arrStatusCache.userId, userId),
        eq(arrStatusCache.provider, kind),
        or(
          inArray(arrStatusCache.status, [...WATCHED]),
          queuedArrIds.length > 0 ? inArray(arrStatusCache.arrId, queuedArrIds) : undefined,
        ),
      ),
    );

  const byId = new Map(servers.map((s) => [s.id, s]));
  const now = Date.now();
  for (const row of rows) {
    const server = row.serverId ? byId.get(row.serverId) : undefined;
    const queue = row.serverId ? queues.get(row.serverId) : undefined;
    if (!server || !queue || row.arrId == null) continue;
    const summary = queue.get(row.arrId);
    const key = `${server.id}:${row.arrId}`;
    if (summary) state.queued.add(key);

    if (summary?.active) {
      state.readySince.delete(key);
      if (row.status !== "tracked_downloading" || row.downloadProgress !== summary.progress) {
        await db
          .update(arrStatusCache)
          .set({ status: "tracked_downloading", downloadProgress: summary.progress, checkedAt: new Date() })
          .where(eq(arrStatusCache.id, row.id));
      }
      continue;
    }
    // Owned with only a finished download left in the queue: nothing to do.
    if (row.status === "owned") continue;
    // Never seen in the queue: a show with some episodes on disk, which
    // stays "tracked_downloading" — the hourly sync looks after it.
    if (!summary && row.status === "tracked_downloading" && !state.queued.has(key)) continue;

    // Waiting to be moved: have Sonarr/Radarr look in its folder again, so a
    // file moved there by hand is seen within a couple of minutes.
    if (row.status === "ready_to_move" || summary?.finished) {
      const readySince = state.readySince.get(key) ?? now;
      state.readySince.set(key, readySince);
      if (rescanDue(now, readySince, state.rescannedAt.get(key))) {
        state.rescannedAt.set(key, now);
        await rescan(server, kind, row.arrId).catch(() => undefined);
      }
    }

    const fields = await freshFields(server, kind, row.arrId, summary).catch(() => null);
    if (!fields) continue;
    // Out of the queue and looked at once since: done with it.
    if (!summary) state.queued.delete(key);
    if (fields.status !== row.status || fields.downloadProgress !== row.downloadProgress) {
      await db
        .update(arrStatusCache)
        .set({ ...fields, checkedAt: new Date() })
        .where(eq(arrStatusCache.id, row.id));
    }

    const mediaType = kind === "radarr" ? "movie" : "tv";
    if (fields.status === "ready_to_move") {
      await tellReady(userId, mediaType, row.tmdbId);
    } else {
      state.readySince.delete(key);
      state.rescannedAt.delete(key);
      state.told.delete(`${userId}:${mediaType}:${row.tmdbId}`);
    }
    if (fields.status === "owned" && row.status !== "owned") {
      scheduleCompletionCheck({ mediaType, tmdbId: row.tmdbId, is4k: false });
    }
  }
}

function rescan(server: ArrServer, kind: ArrProvider, arrId: number): Promise<void> {
  const config = arrConfig(server);
  return kind === "radarr" ? radarr.rescanMovie(config, arrId) : sonarr.rescanSeries(config, arrId);
}

async function freshFields(server: ArrServer, kind: ArrProvider, arrId: number, queue: QueueSummary | undefined) {
  const config = arrConfig(server);
  return kind === "radarr"
    ? radarrRowFields(await radarr.getMovie(config, arrId), queue)
    : sonarrRowFields(await sonarr.getSeries(config, arrId), queue);
}

/** Tells the library owner once that a title is waiting to be moved. */
async function tellReady(userId: string, mediaType: "movie" | "tv", tmdbId: number): Promise<void> {
  const key = `${userId}:${mediaType}:${tmdbId}`;
  if (state.told.has(key)) return;
  const [title] = await db
    .select({ name: titles.name })
    .from(titles)
    .where(and(eq(titles.mediaType, mediaType), eq(titles.tmdbId, tmdbId)))
    .limit(1);
  const name = title?.name ?? "";
  await createNotification({
    userId,
    mediaType,
    tmdbId,
    title: name,
    eventType: "download_ready",
    message: (t) => t("notify.downloadReady", { title: name }),
    relay: false,
    dedupeSince: new Date(Date.now() - (mediaType === "tv" ? READY_NOTICE_DEDUPE_TV_MS : READY_NOTICE_DEDUPE_MS)),
  });
  state.told.add(key);
}
