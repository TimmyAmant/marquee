import { EventEmitter } from "events";
import type { notifications } from "@/lib/db/schema";

// In-process fan-out of new notifications to the live streams native apps
// hold open (/api/v1/notifications/stream). Marquee runs as one process, so
// an EventEmitter is all the "broker" this needs. Kept on globalThis for the
// same reason as the rate limiter's buckets: Next.js may load this module
// more than once in one process, and every copy has to share one emitter.

export type NotificationRow = typeof notifications.$inferSelect;

declare global {
  var __marqueeNotificationBus: EventEmitter | undefined;
}

const bus: EventEmitter = (globalThis.__marqueeNotificationBus ??= (() => {
  const emitter = new EventEmitter();
  // One listener per open app window; a household never gets near this.
  emitter.setMaxListeners(1000);
  return emitter;
})());

export function publishNotification(row: NotificationRow): void {
  bus.emit(`user:${row.userId}`, row);
}

/** Calls `listener` with each new notification for one account until the
 * returned function is called. */
export function subscribeToNotifications(userId: string, listener: (row: NotificationRow) => void): () => void {
  const channel = `user:${userId}`;
  bus.on(channel, listener);
  return () => bus.off(channel, listener);
}
