import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

// "Last active" on Settings → Household members: when each account last
// used the website or an app. Recorded from the two places every signed-in
// request passes through — the browser session check (auth.ts) and the app
// token check (lib/api/token-store.ts) — at most once per interval, so it
// costs a write every few minutes per person, not one per request.

/** How stale lastActiveAt may get before a request refreshes it. */
export const LAST_ACTIVE_INTERVAL_MS = 5 * 60 * 1000;

/** Whether a request now should record activity. Pure; unit tested. */
export function shouldRecordActivity(lastActiveAt: Date | null, now: Date): boolean {
  return !lastActiveAt || now.getTime() - lastActiveAt.getTime() >= LAST_ACTIVE_INTERVAL_MS;
}

declare global {
  var __marqueeLastActiveWrites: Map<string, number> | undefined;
}

// When each account's last write was started from this process, so a burst
// of requests (a page load fetches several things at once) makes one write.
const recent: Map<string, number> = (globalThis.__marqueeLastActiveWrites ??= new Map());

/**
 * Notes that `userId` is using Marquee now, given the lastActiveAt the
 * caller already read with the user. Never throws and never delays the
 * request: the write runs in the background, and its condition makes a
 * racing write from another request a no-op.
 */
export function recordActivity(userId: string, lastActiveAt: Date | null, now = new Date()): void {
  if (!shouldRecordActivity(lastActiveAt, now)) return;
  const started = recent.get(userId);
  if (started !== undefined && now.getTime() - started < LAST_ACTIVE_INTERVAL_MS) return;
  recent.set(userId, now.getTime());
  const threshold = new Date(now.getTime() - LAST_ACTIVE_INTERVAL_MS);
  void db
    .update(users)
    .set({ lastActiveAt: now })
    .where(and(eq(users.id, userId), or(isNull(users.lastActiveAt), lt(users.lastActiveAt, threshold))))
    .catch((err) => {
      recent.delete(userId);
      console.error("[last-active] couldn't record activity:", err);
    });
}
