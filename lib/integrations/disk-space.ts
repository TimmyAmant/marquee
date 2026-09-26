import { and, eq, gte } from "drizzle-orm";
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
