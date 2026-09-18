import { and, eq, lt, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { activityEvents, apiTokens, diskSpaceSnapshots, notifications } from "@/lib/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Read notifications older than this are gone from the bell anyway. */
const READ_NOTIFICATION_RETENTION_DAYS = 90;
/** Unread ones get longer, but not forever. */
const NOTIFICATION_RETENTION_DAYS = 365;
const ACTIVITY_RETENTION_DAYS = 365;
/** Well past the storage forecast's lookback, so the forecast never loses
 * data it uses. */
const DISK_SNAPSHOT_RETENTION_DAYS = 365;

/**
 * Trims the tables that only ever grow — notifications, the activity log,
 * daily disk-space snapshots — and drops API tokens that have expired
 * (otherwise those only go when someone tries to use them). Runs daily; on
 * a household install none of this is big, but a year or two of hourly
 * webhooks adds up.
 */
export async function pruneOldRecords(): Promise<void> {
  const now = Date.now();
  const daysAgo = (days: number) => new Date(now - days * DAY_MS);

  await db
    .delete(notifications)
    .where(
      or(
        and(eq(notifications.read, true), lt(notifications.createdAt, daysAgo(READ_NOTIFICATION_RETENTION_DAYS))),
        lt(notifications.createdAt, daysAgo(NOTIFICATION_RETENTION_DAYS)),
      ),
    );
  await db.delete(activityEvents).where(lt(activityEvents.createdAt, daysAgo(ACTIVITY_RETENTION_DAYS)));
  await db
    .delete(diskSpaceSnapshots)
    .where(lt(diskSpaceSnapshots.capturedAt, daysAgo(DISK_SNAPSHOT_RETENTION_DAYS)));
  await db.delete(apiTokens).where(lt(apiTokens.expiresAt, new Date(now)));
}
