import { and, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runExclusive } from "@/lib/async/single-flight";
import {
  arrStatusCache,
  jellyfinLibraryItems,
  jellyfinServers,
  plexLibraryItems,
  plexServers,
  titles,
} from "@/lib/db/schema";
import type { ArrProvider } from "@/lib/db/schema";
import { arrConfig, listLibraryServers, ownersWithLibraryServers, type ArrServer } from "@/lib/arr/servers";
import { fetchArrRowFields } from "@/lib/arr/sync";
import type { QueueSummary } from "@/lib/integrations/arr-status-logic";
import { scheduleCompletionCheck } from "@/lib/requests/complete";
import * as radarr from "@/lib/radarr/client";
import * as sonarr from "@/lib/sonarr/client";

// The media-server check: Sonarr and Radarr only learn about a file moved
// into the library by hand when they next look in that title's folder —
// Sonarr's own refresh comes round every 12 hours. Plex and Jellyfin usually
// notice much sooner. So after each library sync, a title the library
// owner's Plex or Jellyfin has (more episodes of) than Sonarr/Radarr counts
// gets Sonarr/Radarr asked to rescan just that series or movie — one command
// per title, at most every 45 minutes, backing off to once a day while the
// difference stays the same (two services numbering a show differently, say,
// or a copy on a 4K server the standard Radarr will never find) — and is
// read back a minute later, so the title turns Owned and whoever asked for
// it hears it's ready to watch.
//
// Only the owner's own media servers count, like the Library page's episode
// counts (lib/library/query.ts): per show, regular episodes only — specials
// (season 0) are left out on both sides.

/** The soonest a title is rescanned again… */
export const RESCAN_MIN_GAP_MS = 45 * 60 * 1000;
/** …and the longest it waits once the difference has persisted a while. */
export const RESCAN_MAX_GAP_MS = 24 * 60 * 60 * 1000;
/** Rescans per Sonarr/Radarr owner per run; the rest wait for the next. */
const MAX_RESCANS_PER_RUN = 20;
/** How long Sonarr/Radarr get to rescan before the titles are read back. */
const FOLLOW_UP_MS = 60 * 1000;

/** A cache row, as far as the comparison goes. */
export type ArrSide = { status: string | null; episodesHave: number | null };
/** What the media servers have of a title: present (a movie), and for a
 * show the most regular episodes any one of them has files for. */
export type MediaServerSide = { episodesHave: number | null; source: string };

/**
 * Whether Plex/Jellyfin are ahead of Sonarr/Radarr for a title: it's not
 * Owned there (nor a finished download the download watch is already
 * looking after) and the media server has the movie, or more of the show's
 * regular episodes than Sonarr has files for. Pure.
 */
export function mediaServerAhead(kind: ArrProvider, arr: ArrSide, media: MediaServerSide | undefined): boolean {
  if (!media || arr.status == null || arr.status === "owned" || arr.status === "ready_to_move") return false;
  if (kind === "radarr") return true;
  return arr.episodesHave != null && media.episodesHave != null && media.episodesHave > arr.episodesHave;
}

/** When a title was last rescanned, how many times in a row for the same
 * difference, and what the media server had then. */
export type RescanRecord = { at: number; attempts: number; mediaHave: number | null };

/** The wait after the n-th rescan in a row: 45 minutes, doubling, up to a
 * day. */
export function backoffGap(attempts: number): number {
  return Math.min(RESCAN_MIN_GAP_MS * 2 ** Math.max(0, attempts - 1), RESCAN_MAX_GAP_MS);
}

/** Due for a rescan? Something new on the media server (another episode)
 * starts the backoff over, but never sooner than the minimum gap. Pure
 * apart from the clock it's handed. */
export function rescanAllowed(now: number, record: RescanRecord | undefined, mediaHave: number | null): boolean {
  if (!record) return true;
  const since = now - record.at;
  if (since < RESCAN_MIN_GAP_MS) return false;
  if (mediaHave !== record.mediaHave) return true;
  return since >= backoffGap(record.attempts);
}

/** The record after a rescan now. Pure. */
export function recordRescan(now: number, record: RescanRecord | undefined, mediaHave: number | null): RescanRecord {
  const same = record !== undefined && record.mediaHave === mediaHave;
  return { at: now, attempts: same ? record.attempts + 1 : 1, mediaHave };
}

declare global {
  var __marqueeMediaServerCheck: Map<string, RescanRecord> | undefined;
}

// In memory: a restart costs at most one extra rescan per title.
const records: Map<string, RescanRecord> = (globalThis.__marqueeMediaServerCheck ??= new Map());

type Pending = {
  rowId: string;
  key: string;
  kind: ArrProvider;
  server: ArrServer;
  arrId: number;
  tmdbId: number;
  status: string | null;
  mediaHave: number | null;
  name: string;
};

/** Rescans what's due for one owner's Sonarr or Radarr; returns the titles
 * to read back. */
async function rescanOwner(userId: string, kind: ArrProvider, now: number): Promise<Pending[]> {
  const servers = await listLibraryServers(userId, kind);
  if (servers.length === 0) return [];
  const mediaType = kind === "radarr" ? "movie" : "tv";

  const rows = await db
    .select({
      id: arrStatusCache.id,
      tmdbId: arrStatusCache.externalId,
      arrId: arrStatusCache.arrId,
      serverId: arrStatusCache.serverId,
      status: arrStatusCache.status,
      episodesHave: arrStatusCache.episodesHave,
      name: titles.name,
    })
    .from(arrStatusCache)
    .leftJoin(titles, and(eq(titles.mediaType, mediaType), eq(titles.tmdbId, arrStatusCache.externalId)))
    .where(
      and(
        eq(arrStatusCache.userId, userId),
        eq(arrStatusCache.provider, kind),
        notInArray(arrStatusCache.status, ["owned", "ready_to_move"]),
        isNotNull(arrStatusCache.arrId),
        isNotNull(arrStatusCache.serverId),
      ),
    );
  const prefix = `${userId}:${kind}:`;
  if (rows.length === 0) {
    for (const key of records.keys()) if (key.startsWith(prefix)) records.delete(key);
    return [];
  }

  const media = await mediaServerHoldings(userId, mediaType, [...new Set(rows.map((r) => r.tmdbId))]);
  const byId = new Map(servers.map((s) => [s.id, s]));
  const ahead = new Set<string>();
  const pending: Pending[] = [];
  const arrName = kind === "radarr" ? "Radarr" : "Sonarr";

  for (const row of rows) {
    const server = row.serverId ? byId.get(row.serverId) : undefined;
    const has = media.get(row.tmdbId);
    if (!server || row.arrId == null || !mediaServerAhead(kind, row, has) || !has) continue;
    const key = `${prefix}${row.tmdbId}`;
    ahead.add(key);
    if (pending.length >= MAX_RESCANS_PER_RUN || !rescanAllowed(now, records.get(key), has.episodesHave)) continue;
    records.set(key, recordRescan(now, records.get(key), has.episodesHave));
    const name = row.name ?? `TMDb ${row.tmdbId}`;
    pending.push({
      rowId: row.id,
      key,
      kind,
      server,
      arrId: row.arrId,
      tmdbId: row.tmdbId,
      status: row.status,
      mediaHave: has.episodesHave,
      name,
    });
    console.info(
      kind === "radarr"
        ? `[media-check] ${has.source} has "${name}" but Radarr has no file for it; asking Radarr to rescan it`
        : `[media-check] ${has.source} has ${has.episodesHave} episodes of "${name}" but Sonarr has ${row.episodesHave}; asking ${arrName} to rescan it`,
    );
  }
  // Titles no longer behind start from scratch next time.
  for (const key of records.keys()) if (key.startsWith(prefix) && !ahead.has(key)) records.delete(key);

  const started: Pending[] = [];
  for (const item of pending) {
    try {
      await (kind === "radarr"
        ? radarr.rescanMovie(arrConfig(item.server), item.arrId)
        : sonarr.rescanSeries(arrConfig(item.server), item.arrId));
      started.push(item);
    } catch (err) {
      console.warn(`[media-check] couldn't ask ${arrName} to rescan "${item.name}":`, err);
    }
  }
  return started;
}

/** What the owner's Plex and Jellyfin servers have of these titles. */
async function mediaServerHoldings(
  userId: string,
  mediaType: "movie" | "tv",
  tmdbIds: number[],
): Promise<Map<number, MediaServerSide>> {
  const held = new Map<number, MediaServerSide>();
  if (tmdbIds.length === 0) return held;
  const [plexIds, jellyfinIds] = await Promise.all([
    db.select({ id: plexServers.id }).from(plexServers).where(eq(plexServers.userId, userId)),
    db.select({ id: jellyfinServers.id }).from(jellyfinServers).where(eq(jellyfinServers.userId, userId)),
  ]);
  const [plexRows, jellyfinRows] = await Promise.all([
    plexIds.length === 0
      ? []
      : db
          .select({ tmdbId: plexLibraryItems.tmdbId, have: plexLibraryItems.episodesHave })
          .from(plexLibraryItems)
          .where(
            and(
              inArray(
                plexLibraryItems.plexServerId,
                plexIds.map((s) => s.id),
              ),
              eq(plexLibraryItems.mediaType, mediaType),
              inArray(plexLibraryItems.tmdbId, tmdbIds),
            ),
          ),
    jellyfinIds.length === 0
      ? []
      : db
          .select({ tmdbId: jellyfinLibraryItems.tmdbId, have: jellyfinLibraryItems.episodesHave })
          .from(jellyfinLibraryItems)
          .where(
            and(
              inArray(
                jellyfinLibraryItems.jellyfinServerId,
                jellyfinIds.map((s) => s.id),
              ),
              eq(jellyfinLibraryItems.mediaType, mediaType),
              inArray(jellyfinLibraryItems.tmdbId, tmdbIds),
            ),
          ),
  ]);
  const add = (rows: { tmdbId: number | null; have: number | null }[], source: string) => {
    for (const row of rows) {
      if (row.tmdbId == null) continue;
      const have = mediaType === "movie" ? null : row.have;
      const before = held.get(row.tmdbId);
      if (!before || (have ?? -1) > (before.episodesHave ?? -1)) held.set(row.tmdbId, { episodesHave: have, source });
    }
  };
  add(plexRows, "Plex");
  add(jellyfinRows, "Jellyfin");
  return held;
}

/** Reads the rescanned titles back from Sonarr/Radarr and writes what they
 * say now; one that turned Owned gets its requests checked. */
async function readBack(pending: Pending[]): Promise<void> {
  const queues = new Map<string, Map<number, QueueSummary> | null>();
  for (const item of pending) {
    const queueKey = `${item.kind}:${item.server.id}`;
    if (!queues.has(queueKey)) {
      const config = arrConfig(item.server);
      queues.set(
        queueKey,
        await (item.kind === "radarr" ? radarr.getQueueSummaries(config) : sonarr.getQueueSummaries(config)).catch(
          () => null,
        ),
      );
    }
    // Without the queue a download in progress would read as not
    // downloading; the hourly sync will catch up instead.
    const queue = queues.get(queueKey);
    if (!queue) continue;
    const fields = await fetchArrRowFields(item.server, item.kind, item.arrId, queue.get(item.arrId)).catch(() => null);
    if (!fields) continue;
    await db
      .update(arrStatusCache)
      .set({ ...fields, checkedAt: new Date() })
      .where(eq(arrStatusCache.id, item.rowId));
    const caughtUp =
      fields.status === "owned" ||
      (item.kind === "sonarr" && fields.episodesHave != null && item.mediaHave != null && fields.episodesHave >= item.mediaHave);
    if (caughtUp) records.delete(item.key);
    if (fields.status === "owned" && item.status !== "owned") {
      console.info(`[media-check] "${item.name}" is now in ${item.kind === "radarr" ? "Radarr" : "Sonarr"} in full`);
      scheduleCompletionCheck({ mediaType: item.kind === "radarr" ? "movie" : "tv", tmdbId: item.tmdbId, is4k: false });
    }
  }
}

/**
 * Compares every Sonarr/Radarr owner's library with their Plex/Jellyfin and
 * has the titles the media servers are ahead on rescanned, then reads them
 * back. Run after each library sync; a run already going finishes first, so
 * this one sees what the sync just stored.
 */
export function checkArrAgainstMediaServers(options: { followUpMs?: number; now?: number } = {}): Promise<void> {
  return runExclusive("media-server-check", async () => {
    const now = options.now ?? Date.now();
    const pending: Pending[] = [];
    for (const kind of ["radarr", "sonarr"] as const) {
      for (const userId of await ownersWithLibraryServers(kind)) {
        pending.push(
          ...(await rescanOwner(userId, kind, now).catch((err) => {
            console.error(`[media-check] ${kind} failed for user ${userId}:`, err);
            return [];
          })),
        );
      }
    }
    if (pending.length === 0) return;
    const wait = options.followUpMs ?? FOLLOW_UP_MS;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    await readBack(pending).catch((err) => console.error("[media-check] reading back failed:", err));
  });
}
