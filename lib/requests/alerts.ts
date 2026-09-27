import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications, requests, users } from "@/lib/db/schema";
import { createNotification } from "@/lib/notifications/query";
import { quotedRequestTitle } from "@/lib/requests/labels";
import { translatorsForUsers } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/translator";
import { usersWhoCan } from "@/lib/users/access";

// "Anna requested “Dune” (Season 2)" to everyone who reviews requests — the
// admin and trusted members — so a request doesn't sit unseen until someone
// opens the Requests page. On a phone the push notification carries Approve
// and Decline buttons (public/sw.js → app/api/push/requests/[id]/[action]).

/** Reviewers, the admin first — the admin's copy is the one relayed to
 * the household channels (Discord and the rest), so those hear about it
 * once. Each reviewer's own channels follow their own choices. */
async function reviewersExcept(userId: string) {
  return (await usersWhoCan("reviewRequests")).filter((reviewer) => reviewer.id !== userId);
}

/** Once a request has been reviewed, its alerts have done their job: mark
 * them read everywhere, so they don't pile up in the other reviewers' bells. */
export async function clearRequestAlerts(requestId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.requestId, requestId), eq(notifications.eventType, "request_created")));
}

/** "Anna requested "Dune" (Season 2)", in `t`'s language. */
function requestedMessage(
  t: Translator,
  who: string | null,
  request: { title: string; seasons: number[] | null; is4k: boolean },
): string {
  const quoted = quotedRequestTitle(t, request.title, request.seasons);
  return t("notify.requested", {
    who: who || t("notify.someone"),
    request: request.is4k ? t("notify.requestIn4k", { request: quoted }) : quoted,
  });
}

/** A pending request was changed (other seasons, or 4K): its "new request"
 * alerts nobody has read yet say what's asked for now — each in its
 * reader's language. */
export async function refreshRequestAlerts(request: {
  id: string;
  requestedByUserId: string;
  title: string;
  seasons: number[] | null;
  is4k: boolean;
}): Promise<void> {
  const [requester] = await db
    .select({ name: users.displayName, username: users.username })
    .from(users)
    .where(eq(users.id, request.requestedByUserId))
    .limit(1);
  const who = requester?.name || requester?.username || null;
  const unread = and(
    eq(notifications.requestId, request.id),
    eq(notifications.eventType, "request_created"),
    eq(notifications.read, false),
  );
  const readers = await db.selectDistinct({ userId: notifications.userId }).from(notifications).where(unread);
  const translators = await translatorsForUsers(readers.map((r) => r.userId));
  for (const { userId } of readers) {
    const t = translators.get(userId)!;
    await db
      .update(notifications)
      .set({ message: requestedMessage(t, who, request), is4k: request.is4k })
      .where(and(unread, eq(notifications.userId, userId)));
  }
}

/**
 * One alert for everything a Plex Watchlist sync filed for a member that's
 * still waiting — not one per title, which a long watchlist would turn into
 * dozens of pushes and Discord posts. No Approve / Decline buttons: there's
 * more than one request behind it.
 */
export async function notifyReviewersOfWatchlist(requesterId: string, requestIds: string[]): Promise<void> {
  await notifyReviewersOfBatch(requesterId, requestIds, (t, who, count, list) =>
    t("notify.watchlistRequested", { who, count, list }),
  );
}

/** Same for a member's Trakt list kept in sync (lib/trakt/sync.ts): one
 * alert per list per check. */
export async function notifyReviewersOfTraktSync(
  requesterId: string,
  requestIds: string[],
  /** The list's name, in each reader's language (a watchlist's is worded). */
  listName: (t: Translator) => string,
): Promise<void> {
  await notifyReviewersOfBatch(requesterId, requestIds, (t, who, count, list) =>
    t("notify.traktRequested", { who, listName: listName(t), count, list }),
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
  await notifyReviewersOfBatch(requesterId, requestIds, (t, who, count, list) =>
    t("notify.collectionRequested", { who, collection, count, list }),
  );
}

/** "“A”, “B” and 3 more" — the first two names of a batch. Pure. */
export function batchTitleList(t: Translator, titles: string[]): string {
  const names = titles
    .slice(0, 2)
    .map((title) => t("notify.batchQuoted", { title }))
    .join(", ");
  return titles.length > 2 ? t("notify.batchMore", { list: names, count: titles.length - 2 }) : names;
}

async function notifyReviewersOfBatch(
  requesterId: string,
  requestIds: string[],
  describe: (t: Translator, who: string, count: number, list: string) => string,
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
  const who = requester?.name || requester?.username || null;
  // In each reader's language (and the household's, for its channels).
  const message = (t: Translator) =>
    describe(t, who || t("notify.someone"), waiting.length, batchTitleList(t, waiting.map((r) => r.title)));
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
  for (const [index, reviewer] of reviewers.entries()) {
    await createNotification({
      userId: reviewer.id,
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
      title: request.title,
      eventType: "request_created",
      message: (t) => requestedMessage(t, who, request),
      requestId,
      is4k: request.is4k,
      relay: index === 0,
    }).catch(() => undefined);
  }
}
