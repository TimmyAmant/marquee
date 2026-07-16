import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import type { MediaType, NotificationEventType } from "@/lib/db/schema";

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
}
