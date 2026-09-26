import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requests, users } from "@/lib/db/schema";
import { createNotification } from "@/lib/notifications/query";
import { quotedRequestTitle } from "@/lib/requests/labels";

// "Anna requested “Dune” (Season 2)" to everyone who reviews requests — the
// admin and trusted members — so a request doesn't sit unseen until someone
// opens the Requests page. On a phone the push notification carries Approve
// and Decline buttons (public/sw.js → app/api/push/requests/[id]/[action]).

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

  const reviewers = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(inArray(users.role, ["admin", "trusted"]), ne(users.id, request.requesterId)));
  // The admin's copy goes to Discord, ntfy and the rest; the trusted
  // members' copies don't, so those channels hear about it once.
  reviewers.sort((a, b) => (a.role === "admin" ? -1 : b.role === "admin" ? 1 : 0));

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
