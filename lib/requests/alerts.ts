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
 * the household channels (Discord and the rest), so those hear about it
 * once. Each reviewer's own channels follow their own choices. */
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
  if (requestIds.length === 0) return;
  const waiting = await db
    .select({ id: requests.id, mediaType: requests.mediaType, tmdbId: requests.tmdbId, title: requests.title })
    .from(requests)
    .where(and(inArray(requests.id, requestIds), eq(requests.status, "pending")));
  if (waiting.length === 0) return;
  const [requester] = await db
    .select({ name: users.displayName, username: users.username })
    .from(users)
    .where(eq(users.id, requesterId))
    .limit(1);
  const who = requester?.name || requester?.username || "Someone";
  const names = waiting.slice(0, 2).map((r) => `“${r.title}”`);
  const more = waiting.length > 2 ? ` and ${waiting.length - 2} more` : "";
  const message =
    waiting.length === 1
      ? `${who}'s Plex Watchlist requested ${names[0]}`
      : `${who}'s Plex Watchlist requested ${waiting.length} titles: ${names.join(", ")}${more}`;
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
      topic: "watchlist_requests",
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
