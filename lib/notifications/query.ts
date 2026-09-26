import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications, users } from "@/lib/db/schema";
import type { MediaType, NotificationEventType } from "@/lib/db/schema";
import { getDiscordWebhookUrl, getGenericWebhookUrl, getNtfyUrl } from "@/lib/integrations/app-settings";
import { sendDiscordMessage } from "@/lib/discord/client";
import { sendWebhookNotification } from "@/lib/webhook/client";
import { sendNtfyMessage } from "@/lib/ntfy/client";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { sendPushoverMessage } from "@/lib/pushover/client";
import { sendEmail } from "@/lib/email/client";
import { getChannelConfig } from "@/lib/notifications/channels";
import { publishNotification } from "@/lib/notifications/bus";
import { pushMessageFor, pushToUser } from "@/lib/push/deliver";

const EVENT_EMOJI: Record<NotificationEventType, string> = {
  grabbed: "⬇️",
  downloaded: "✅",
  request_approved: "👍",
  request_rejected: "👎",
  issue_reported: "⚠️",
  issue_resolved: "🛠️",
  request_created: "🙋",
  title_shared: "📨",
};

export async function getUnreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
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

/** Newest first, each with `sender`: the account that shared the title
 * (title_shared), else null. */
export async function getRecentNotifications(userId: string, limit = 20) {
  const rows = await db
    .select({
      notification: notifications,
      senderUsername: users.username,
      senderDisplayName: users.displayName,
      senderAvatarUpdatedAt: users.avatarUpdatedAt,
    })
    .from(notifications)
    .leftJoin(users, eq(users.id, notifications.senderUserId))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map(({ notification, senderUsername, senderDisplayName, senderAvatarUpdatedAt }) => ({
    ...notification,
    sender:
      notification.senderUserId && senderUsername
        ? {
            id: notification.senderUserId,
            username: senderUsername,
            displayName: senderDisplayName,
            avatarUpdatedAt: senderAvatarUpdatedAt,
          }
        : null,
  }));
}

export async function createNotification(input: {
  userId: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  eventType: NotificationEventType;
  message: string;
  /** Also post to Discord / ntfy / Telegram / Pushover / email / the generic webhook. Those channels are
   * household-wide, so a second notification about the same event (e.g. the
   * requester's copy of a download the admin was already told about) passes
   * false to avoid posting it twice. */
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
  /** title_shared: who shared it, and their note (lib/sharing). */
  senderUserId?: string;
  note?: string | null;
}): Promise<boolean> {
  const { relay = true, dedupeSince, ...row } = input;
  const saved = dedupeSince ? await insertUnlessRecent(row, dedupeSince) : await insertNotification(row);
  if (!saved) return false;

  // Straight to the account's own devices: the apps' live streams and every
  // browser that turned notifications on. Unlike the relays below these are
  // personal, so they go out even for a copy that isn't relayed.
  publishNotification(saved);
  void pushToUser(saved.userId, pushMessageFor(saved));

  if (!relay) return true;

  // Best-effort relay to every configured channel — a channel being down or
  // unconfigured should never break the in-app notification (already saved
  // above), which is why each of these is fire-and-forget with its own
  // catch rather than awaited inline.
  getDiscordWebhookUrl()
    .then((webhookUrl) => {
      if (!webhookUrl) return;
      return sendDiscordMessage(webhookUrl, `${EVENT_EMOJI[input.eventType]} ${input.message}`);
    })
    .catch(() => undefined);

  getNtfyUrl()
    .then((topicUrl) => {
      if (!topicUrl) return;
      return sendNtfyMessage(topicUrl, input.title, input.message);
    })
    .catch(() => undefined);

  getChannelConfig("telegram")
    .then((config) => {
      if (!config) return;
      return sendTelegramMessage(config, `${EVENT_EMOJI[input.eventType]} ${input.message}`);
    })
    .catch(() => undefined);

  getChannelConfig("pushover")
    .then((config) => {
      if (!config) return;
      return sendPushoverMessage(config, input.title, input.message);
    })
    .catch(() => undefined);

  getChannelConfig("email")
    .then((config) => {
      if (!config) return;
      return sendEmail(config, `${EVENT_EMOJI[input.eventType]} ${input.message}`, `${input.message}\n\n— Marquee`);
    })
    .catch(() => undefined);

  getGenericWebhookUrl()
    .then((url) => {
      if (!url) return;
      return sendWebhookNotification(url, {
        event: input.eventType,
        title: input.title,
        message: input.message,
      });
    })
    .catch(() => undefined);

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
