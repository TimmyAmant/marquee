import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import type { MediaType, NotificationEventType } from "@/lib/db/schema";
import { getDiscordWebhookUrl } from "@/lib/integrations/app-settings";
import { sendDiscordMessage } from "@/lib/discord/client";

const EVENT_EMOJI: Record<NotificationEventType, string> = {
  grabbed: "⬇️",
  downloaded: "✅",
  request_approved: "👍",
  request_rejected: "👎",
};

export async function getUnreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  return row?.count ?? 0;
}

export async function getRecentNotifications(userId: string, limit = 20) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
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
}): Promise<void> {
  await db.insert(notifications).values(input);

  // Best-effort relay to Discord — a webhook failure should never break the
  // in-app notification, which is why this is fire-and-forget with its own
  // catch rather than awaited inline above.
  getDiscordWebhookUrl()
    .then((webhookUrl) => {
      if (!webhookUrl) return;
      return sendDiscordMessage(webhookUrl, `${EVENT_EMOJI[input.eventType]} ${input.message}`);
    })
    .catch(() => undefined);
}
