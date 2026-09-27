import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { arrServers, diskSpaceSnapshots } from "@/lib/db/schema";
import { arrConfig, listArrServers } from "@/lib/arr/servers";
import { forecastDiskSpace, type DiskSpaceForecast } from "@/lib/integrations/disk-space-logic";
import * as radarr from "@/lib/radarr/client";
import * as sonarr from "@/lib/sonarr/client";

export type DiskSpaceInfo = { path: string; freeSpace: number };

/** Free space remaining on each unique root folder across connected
 * Radarr/Sonarr instances. The same disk can back both a movies and a TV
 * root folder, so dedupe by path rather than summing every root folder
 * from every provider — that would double-count shared disks. */
export async function getDiskSpaceSummary(userId: string): Promise<DiskSpaceInfo[]> {
  // Every server, 4K ones included — they fill disks too. Two servers on
  // the same machine report the same folders, so a path counts once.
  const servers = await listArrServers(userId);
  const folderLists = await Promise.all(
    servers.map((server) =>
      (server.kind === "radarr" ? radarr.getRootFolders(arrConfig(server)) : sonarr.getRootFolders(arrConfig(server))).catch(
        () => [],
      ),
    ),
  );

  const byPath = new Map<string, number>();
  for (const folders of folderLists) {
    for (const folder of folders) {
      if (typeof folder.freeSpace === "number") byPath.set(folder.path, folder.freeSpace);
    }
  }

  return [...byPath.entries()].map(([path, freeSpace]) => ({ path, freeSpace }));
}

/** Records today's free space per root folder — called once a day from the
 * cron in instrumentation.ts, not on every page load, since a forecast only
 * needs one data point per day, not one per request. */
export async function snapshotDiskSpace(userId: string): Promise<void> {
  const summary = await getDiskSpaceSummary(userId);
  if (summary.length === 0) return;

  await db.insert(diskSpaceSnapshots).values(
    summary.map((d) => ({ userId, path: d.path, freeBytes: d.freeSpace })),
  );
}

export async function snapshotDiskSpaceForAllConnectedUsers(): Promise<void> {
  const rows = await db.selectDistinct({ userId: arrServers.userId }).from(arrServers);
  for (const { userId } of rows) {
    await snapshotDiskSpace(userId).catch((err) => {
      console.error(`[disk-space-snapshot] failed for user ${userId}:`, err);
    });
  }
}

export type { DiskSpaceForecast };

export type StorageFolder = {
  path: string;
  freeBytes: number;
  /** The Sonarr/Radarr servers that have this root folder ("Radarr", "4K Sonarr"). */
  servers: string[];
};

export type StorageOverview = {
  folders: StorageFolder[];
  totalFreeBytes: number;
  /** When the free-space figures were read: "live" from the servers just
   * now, or the newest daily snapshot's time when no server answered (or
   * none is connected). Null when there's nothing at all. */
  measuredAt: Date | null;
  live: boolean;
  forecast: DiskSpaceForecast | null;
};

/**
 * The Library page's Storage card: free space per root folder, with the
 * servers that use it, and the forecast. Reads the servers live (a few
 * seconds at most, each failure skipped); if none answers, the newest
 * snapshot per path stands in, so the card still shows something while a
 * server is down.
 */
export async function getStorageOverview(userId: string): Promise<StorageOverview> {
  const servers = await listArrServers(userId);
  const folderLists = await Promise.all(
    servers.map((server) =>
      (server.kind === "radarr" ? radarr.getRootFolders(arrConfig(server)) : sonarr.getRootFolders(arrConfig(server))).catch(
        () => null,
      ),
    ),
  );

  const byPath = new Map<string, StorageFolder>();
  for (const [index, folders] of folderLists.entries()) {
    if (!folders) continue;
    for (const folder of folders) {
      if (typeof folder.freeSpace !== "number") continue;
      const entry = byPath.get(folder.path) ?? { path: folder.path, freeBytes: folder.freeSpace, servers: [] };
      entry.freeBytes = folder.freeSpace;
      if (!entry.servers.includes(servers[index].name)) entry.servers.push(servers[index].name);
      byPath.set(folder.path, entry);
    }
  }

  let live = byPath.size > 0;
  let measuredAt: Date | null = live ? new Date() : null;

  if (!live) {
    // The newest snapshot of each path, newest day first.
    const rows = await db
      .select({ path: diskSpaceSnapshots.path, freeBytes: diskSpaceSnapshots.freeBytes, capturedAt: diskSpaceSnapshots.capturedAt })
      .from(diskSpaceSnapshots)
      .where(eq(diskSpaceSnapshots.userId, userId))
      .orderBy(desc(diskSpaceSnapshots.capturedAt))
      .limit(500);
    for (const row of rows) {
      if (byPath.has(row.path)) continue;
      byPath.set(row.path, { path: row.path, freeBytes: row.freeBytes, servers: [] });
      if (!measuredAt || row.capturedAt > measuredAt) measuredAt = row.capturedAt;
    }
    live = false;
  }

  const folders = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  const forecast = await getDiskSpaceForecast(userId).catch(() => null);
  return {
    folders,
    totalFreeBytes: folders.reduce((sum, f) => sum + f.freeBytes, 0),
    measuredAt,
    live,
    forecast,
  };
}

const FORECAST_LOOKBACK_DAYS = 30;

/** "Days until full" from the last month of snapshots — the math lives in
 * disk-space-logic.ts, see forecastDiskSpace for how days and paths are
 * compared. */
export async function getDiskSpaceForecast(userId: string): Promise<DiskSpaceForecast | null> {
  const since = new Date(Date.now() - FORECAST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      path: diskSpaceSnapshots.path,
      freeBytes: diskSpaceSnapshots.freeBytes,
      capturedAt: diskSpaceSnapshots.capturedAt,
    })
    .from(diskSpaceSnapshots)
    .where(and(eq(diskSpaceSnapshots.userId, userId), gte(diskSpaceSnapshots.capturedAt, since)));

  return forecastDiskSpace(rows);
}
