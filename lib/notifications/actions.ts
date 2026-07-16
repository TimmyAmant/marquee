"use server";

import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { getUnreadCount, getRecentNotifications } from "@/lib/notifications/query";

export async function getUnreadCountAction(): Promise<number> {
  const session = await auth();
  if (!session?.user) return 0;
  return getUnreadCount(session.user.id);
}

export async function getRecentNotificationsAction() {
  const session = await auth();
  if (!session?.user) return [];
  return getRecentNotifications(session.user.id);
}

export async function markAllReadAction(): Promise<void> {
  const session = await auth();
  if (!session?.user) return;
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, session.user.id), eq(notifications.read, false)));
}

export async function markReadAction(notificationId: string): Promise<void> {
  const session = await auth();
  if (!session?.user) return;
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, session.user.id)));
}
