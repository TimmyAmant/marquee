import { and, eq, gt, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { arrStatusCache, titles } from "@/lib/db/schema";
import type { ArrProvider } from "@/lib/db/schema";
import { arrConfig, listLibraryServers, ownersWithLibraryServers, type ArrServer } from "@/lib/arr/servers";
import { fetchArrRowFields } from "@/lib/arr/sync";
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
//
// A finished download waiting to be moved in is watched for a while after
// it leaves the queue (watchUntil, kept in the database so a restart doesn't
// forget it): its files are often moved in bit by bit, and Sonarr/Radarr
// only notice them when they look in the folder again.

/** How often a title waiting to be moved has its folder looked at again. */
const RESCAN_EVERY_MS = 2 * 60 * 1000;
/** …slowing down once it's been waiting a while. */
const RESCAN_SLOW_AFTER_MS = 60 * 60 * 1000;
const RESCAN_SLOW_EVERY_MS = 15 * 60 * 1000;
/** "Ready to move" is told about once per movie in this long… */
const READY_NOTICE_DEDUPE_MS = 30 * 24 * 60 * 60 * 1000;
/** …and once a day per show, whose next episode is new news. */
const READY_NOTICE_DEDUPE_TV_MS = 24 * 60 * 60 * 1000;
/** How long a finished download is watched after it was last seen waiting
 * to be moved — as long as Sonarr's own folder refresh takes to come round. */
export const WATCH_AFTER_READY_MS = 12 * 60 * 60 * 1000;
/** watchUntil is pushed back at most this often while the download waits. */
const WATCH_EXTEND_EVERY_MS = 60 * 60 * 1000;

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
      watchUntil: arrStatusCache.watchUntil,
      name: titles.name,
    })
    .from(arrStatusCache)
    .leftJoin(
      titles,
      and(eq(titles.mediaType, kind === "radarr" ? "movie" : "tv"), eq(titles.tmdbId, arrStatusCache.externalId)),
    )
    .where(
      and(
        eq(arrStatusCache.userId, userId),
        eq(arrStatusCache.provider, kind),
        or(
          inArray(arrStatusCache.status, [...WATCHED]),
          gt(arrStatusCache.watchUntil, new Date()),
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
    const watching = row.watchUntil != null && row.watchUntil.getTime() > now;
    // Owned with only a finished download left in the queue: nothing to do.
    if (row.status === "owned") {
      if (row.watchUntil) await db.update(arrStatusCache).set({ watchUntil: null }).where(eq(arrStatusCache.id, row.id));
      continue;
    }
    // Never seen in the queue: a show with some episodes on disk, which
    // stays "tracked_downloading" — the hourly sync looks after it.
    if (!summary && row.status === "tracked_downloading" && !state.queued.has(key) && !watching) continue;

    // Waiting to be moved, or moved in since: have Sonarr/Radarr look in its
    // folder again, so a file moved there by hand is seen within a couple of
    // minutes.
    if (row.status === "ready_to_move" || summary?.finished || (!summary && watching)) {
      const firstLook = !state.readySince.has(key);
      const readySince = state.readySince.get(key) ?? now;
      state.readySince.set(key, readySince);
      if (rescanDue(now, readySince, state.rescannedAt.get(key))) {
        state.rescannedAt.set(key, now);
        if (firstLook) {
          console.info(`[download-watch] asking ${kind} to look for "${row.name ?? row.tmdbId}" in its folder`);
        }
        await rescan(server, kind, row.arrId).catch(() => undefined);
      }
    }

    const fields = await fetchArrRowFields(server, kind, row.arrId, summary).catch(() => null);
    if (!fields) continue;
    // Out of the queue and looked at once since: done with it.
    if (!summary) state.queued.delete(key);
    const watchUntil = nextWatchUntil(now, row.watchUntil, fields.status, summary);
    if (
      fields.status !== row.status ||
      fields.downloadProgress !== row.downloadProgress ||
      watchUntil?.getTime() !== row.watchUntil?.getTime()
    ) {
      await db
        .update(arrStatusCache)
        .set({ ...fields, watchUntil, checkedAt: new Date() })
        .where(eq(arrStatusCache.id, row.id));
    }

    const mediaType = kind === "radarr" ? "movie" : "tv";
    if (fields.status === "ready_to_move") {
      await tellReady(userId, mediaType, row.tmdbId);
    } else {
      state.told.delete(`${userId}:${mediaType}:${row.tmdbId}`);
      // Still watched (moved in, Sonarr/Radarr not caught up yet): the
      // rescans carry on at the pace they were going.
      if (!(watchUntil && watchUntil.getTime() > now)) {
        state.readySince.delete(key);
        state.rescannedAt.delete(key);
      }
    }
    if (fields.status === "owned" && row.status !== "owned") {
      scheduleCompletionCheck({ mediaType, tmdbId: row.tmdbId, is4k: false });
    }
  }
}

/**
 * Until when a title stays watched, given what it turned out to be. Owned:
 * not at all. A finished download waiting to be moved in: for
 * WATCH_AFTER_READY_MS from now (written back at most hourly). Anything
 * else keeps what it had. Pure apart from the clock it's handed.
 */
export function nextWatchUntil(
  now: number,
  current: Date | null,
  status: string,
  queue: QueueSummary | undefined,
): Date | null {
  if (status === "owned") return null;
  if (status === "ready_to_move" || queue?.finished) {
    if (!current || current.getTime() <= now + WATCH_AFTER_READY_MS - WATCH_EXTEND_EVERY_MS) {
      return new Date(now + WATCH_AFTER_READY_MS);
    }
  }
  return current;
}

function rescan(server: ArrServer, kind: ArrProvider, arrId: number): Promise<void> {
  const config = arrConfig(server);
  return kind === "radarr" ? radarr.rescanMovie(config, arrId) : sonarr.rescanSeries(config, arrId);
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
