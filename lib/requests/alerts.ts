import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications, requests, users } from "@/lib/db/schema";
import { createNotification } from "@/lib/notifications/query";
import { quotedRequestTitle } from "@/lib/requests/labels";

// "Anna requested “Dune” (Season 2)" to everyone who reviews requests — the
// admin and trusted members — so a request doesn't sit unseen until someone
// opens the Requests page. On a phone the push notification carries Approve
// and Decline buttons (public/sw.js → app/api/push/requests/[id]/[action]).

/** Reviewers, the admin first — the admin's copy is the one relayed to
 * Discord and the other channels, so those hear about it once. */
async function reviewersExcept(userId: string) {
  const reviewers = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(inArray(users.role, ["admin", "trusted"]), ne(users.id, userId)));
  return reviewers.sort((a, b) => (a.role === "admin" ? -1 : b.role === "admin" ? 1 : 0));
}

/** Once a request has been reviewed, its alerts have done their job: mark
 * them read everywhere, so they don't pile up in the other reviewers' bells. */
export async function clearRequestAlerts(requestId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.requestId, requestId), eq(notifications.eventType, "request_created")));
}

/**
 * One alert for everything a Plex Watchlist sync filed for a member that's
 * still waiting — not one per title, which a long watchlist would turn into
 * dozens of pushes and Discord posts. No Approve / Decline buttons: there's
 * more than one request behind it.
 */
export async function notifyReviewersOfWatchlist(requesterId: string, requestIds: string[]): Promise<void> {
  await notifyReviewersOfBatch(requesterId, requestIds, (who, count, list) =>
    count === 1 ? `${who}'s Plex Watchlist requested ${list}` : `${who}'s Plex Watchlist requested ${count} titles: ${list}`,
  );
}

/** Same idea for a member's "Request all N missing" on a franchise row
 * (lib/requests/request-all.ts): one "Anna requested 3 titles from “Ice Age
 * Collection”" rather than three pushes. */
export async function notifyReviewersOfCollection(
  requesterId: string,
  requestIds: string[],
  collection: string,
): Promise<void> {
  await notifyReviewersOfBatch(requesterId, requestIds, (who, count, list) =>
    count === 1 ? `${who} requested ${list}` : `${who} requested ${count} titles from “${collection}”: ${list}`,
  );
}

/** "“A”, “B” and 3 more" — the first two names of a batch. Pure. */
export function batchTitleList(titles: string[]): string {
  const names = titles.slice(0, 2).map((t) => `“${t}”`);
  const more = titles.length > 2 ? ` and ${titles.length - 2} more` : "";
  return names.join(", ") + more;
}

async function notifyReviewersOfBatch(
  requesterId: string,
  requestIds: string[],
  describe: (who: string, count: number, list: string) => string,
): Promise<void> {
  if (requestIds.length === 0) return;
  const waiting = await db
    .select({ id: requests.id, mediaType: requests.mediaType, tmdbId: requests.tmdbId, title: requests.title })
    .from(requests)
    .where(and(inArray(requests.id, requestIds), eq(requests.status, "pending")));
  if (waiting.length === 0) return;
  // Oldest first, as they were asked for.
  waiting.sort((a, b) => requestIds.indexOf(a.id) - requestIds.indexOf(b.id));
  const [requester] = await db
    .select({ name: users.displayName, username: users.username })
    .from(users)
    .where(eq(users.id, requesterId))
    .limit(1);
  const who = requester?.name || requester?.username || "Someone";
  const message = describe(who, waiting.length, batchTitleList(waiting.map((r) => r.title)));
  const [first] = waiting;
  for (const [index, reviewer] of (await reviewersExcept(requesterId)).entries()) {
    await createNotification({
      userId: reviewer.id,
      mediaType: first.mediaType,
      tmdbId: first.tmdbId,
      title: first.title,
      eventType: "request_created",
      message,
      ...(waiting.length === 1 ? { requestId: first.id } : {}),
      relay: index === 0,
    }).catch(() => undefined);
  }
}

/** Only while it's still pending: an auto-approved request needs no one. */
export async function notifyReviewersOfRequest(requestId: string): Promise<void> {
  const [request] = await db
    .select({
      status: requests.status,
      requesterId: requests.requestedByUserId,
      mediaType: requests.mediaType,
      tmdbId: requests.tmdbId,
      title: requests.title,
      seasons: requests.seasons,
      is4k: requests.is4k,
      requesterName: users.displayName,
      requesterUsername: users.username,
    })
    .from(requests)
    .innerJoin(users, eq(users.id, requests.requestedByUserId))
    .where(eq(requests.id, requestId))
    .limit(1);
  if (!request || request.status !== "pending") return;

  const reviewers = await reviewersExcept(request.requesterId);

  const who = request.requesterName || request.requesterUsername;
  const what = quotedRequestTitle(request.title, request.seasons) + (request.is4k ? " in 4K" : "");
  for (const [index, reviewer] of reviewers.entries()) {
    await createNotification({
      userId: reviewer.id,
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
      title: request.title,
      eventType: "request_created",
      message: `${who} requested ${what}`,
      requestId,
      is4k: request.is4k,
      relay: index === 0,
    }).catch(() => undefined);
  }
}
