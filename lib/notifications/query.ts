import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import type { MediaType, NotificationEventType } from "@/lib/db/schema";
import { publishNotification } from "@/lib/notifications/bus";
import { pushMessageFor, pushToUser } from "@/lib/push/deliver";
import { bellAndPushFor, preferenceEventFor, type NotificationPreferenceEvent } from "@/lib/notifications/events";
import { loadBellPushOverrides } from "@/lib/notifications/preferences";
import { fanOut } from "@/lib/notifications/fan-out";

export async function getUnreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false), eq(notifications.inBell, true)));
  return row?.count ?? 0;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
}

/** Scoped to the owner, so one user can never mark another's notification. */
export async function markNotificationRead(userId: string, notificationId: string): Promise<boolean> {
  const updated = await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });
  return updated.length > 0;
}

/** The bell's list: what this account chose to see there. */
export async function getRecentNotifications(userId: string, limit = 20) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.inBell, true)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function createNotification(input: {
  userId: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  eventType: NotificationEventType;
  message: string;
  /** Also post to the household channels (Discord / ntfy / Telegram /
   * Pushover / email / the generic webhook), for the events the admin
   * picked. Those are household-wide, so a second notification about the
   * same event (e.g. the requester's copy of a download the admin was
   * already told about) passes false to avoid posting it twice. The
   * account's own channels are separate and follow its own choices. */
  relay?: boolean;
  /** Skip it (and return false) if this user already has a notification for
   * the same title and event since this moment. Sonarr sends one webhook per
   * episode, so a season pack would otherwise notify (and relay) once per
   * episode. */
  dedupeSince?: Date;
  /** About the 4K copy: repeats are only dropped among other 4K notices. */
  is4k?: boolean;
  /** request_created: the request its Approve / Decline buttons act on. */
  requestId?: string;
  /** Which of Settings' events this is, when it isn't the eventType's usual
   * one (lib/notifications/events.ts) — a Plex Watchlist batch. */
  topic?: NotificationPreferenceEvent;
}): Promise<boolean> {
  const { relay = true, dedupeSince, topic, ...row } = input;
  const event = topic ?? preferenceEventFor(input.eventType);
  // Not being able to read the choices mustn't lose the notification: the
  // defaults are what everyone had before there were choices.
  const overrides = await loadBellPushOverrides(input.userId).catch(() => ({}));
  const { inApp, push } = bellAndPushFor(overrides, event);
  // One kept out of the bell starts out read, so the cleanup job
  // (lib/jobs/cleanup.ts) clears it away like any other read one.
  const values = { ...row, inBell: inApp, alert: push, ...(inApp ? {} : { read: true }) };
  // Saved even when it's neither in the bell nor pushed: that's how a
  // repeat (the next episode of a season pack) is recognised.
  const saved = dedupeSince ? await insertUnlessRecent(values, dedupeSince) : await insertNotification(values);
  if (!saved) return false;

  // Straight to the account's own devices: the apps' live streams (which
  // update the bell, and show a banner unless `alert` is false) and every
  // browser that turned notifications on.
  if (saved.inBell || saved.alert) publishNotification(saved);
  if (saved.alert) void pushToUser(saved.userId, pushMessageFor(saved));

  // Household and personal channels, in the background: the notification
  // is already saved, and a slow or broken channel mustn't hold anything up.
  void fanOut(
    {
      userId: saved.userId,
      eventType: saved.eventType,
      event,
      title: saved.title,
      message: saved.message,
      mediaType: saved.mediaType,
      tmdbId: saved.tmdbId,
    },
    relay,
  );
  return true;
}

type NewNotification = typeof notifications.$inferInsert;

async function insertNotification(row: NewNotification) {
  const [saved] = await db.insert(notifications).values(row).returning();
  return saved;
}

/** Check-then-insert under a transaction-scoped advisory lock on this user,
 * title and event. The episodes of a season pack import in parallel, and a
 * plain check-then-insert lets several of them see "nothing yet" at once. A
 * unique index can't express "since this moment", so a lock it is. */
async function insertUnlessRecent(row: NewNotification, since: Date) {
  const is4k = row.is4k ?? false;
  const lockKey = `marquee-notification:${row.userId}:${row.mediaType}:${row.tmdbId}:${row.eventType}:${is4k}`;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const [existing] = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, row.userId),
          eq(notifications.mediaType, row.mediaType),
          eq(notifications.tmdbId, row.tmdbId),
          eq(notifications.eventType, row.eventType),
          eq(notifications.is4k, is4k),
          gte(notifications.createdAt, since),
        ),
      )
      .limit(1);
    if (existing) return null;
    const [saved] = await tx.insert(notifications).values(row).returning();
    return saved;
  });
}
