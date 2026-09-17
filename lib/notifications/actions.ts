"use server";

import { auth } from "@/auth";
import {
  getUnreadCount,
  getRecentNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/query";

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
  await markAllNotificationsRead(session.user.id);
}

export async function markReadAction(notificationId: string): Promise<void> {
  const session = await auth();
  if (!session?.user) return;
  await markNotificationRead(session.user.id, notificationId);
}
