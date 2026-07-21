import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requests, users, titles } from "@/lib/db/schema";
import type { MediaType, RequestStatus } from "@/lib/db/schema";
import { getTitleLibraryStatus } from "@/lib/integrations/status";
import { createNotification } from "@/lib/notifications/query";

/**
 * Pending requests for the admin to review, with a reconciliation pass first:
 * a request can go stale (the requested title gets added some other way, or
 * was already owned all along and the requester just couldn't see that) —
 * those are auto-resolved as approved here rather than left for the admin to
 * manually approve/reject something that's already sitting in the library.
 */
export async function getPendingRequests(viewerUserId: string) {
  const rows = await db
    .select({
      id: requests.id,
      mediaType: requests.mediaType,
      tmdbId: requests.tmdbId,
      tvdbId: titles.tvdbId,
      title: requests.title,
      posterPath: requests.posterPath,
      createdAt: requests.createdAt,
      requestedByUserId: requests.requestedByUserId,
      requestedByName: users.displayName,
      requestedByUsername: users.username,
    })
    .from(requests)
    .innerJoin(users, eq(users.id, requests.requestedByUserId))
    .leftJoin(
      titles,
      and(eq(titles.mediaType, requests.mediaType), eq(titles.tmdbId, requests.tmdbId)),
    )
    .where(eq(requests.status, "pending"))
    .orderBy(desc(requests.createdAt));

  if (rows.length === 0) return [];

  const statuses = await Promise.all(
    rows.map((r) =>
      getTitleLibraryStatus(viewerUserId, r.mediaType, r.tmdbId, r.tvdbId).catch(
        () => ({ status: "untracked" as const, provider: null, configured: false, file: null }),
      ),
    ),
  );

  const alreadyOwnedIds = rows
    .filter((_, i) => statuses[i].status !== "untracked")
    .map((r) => r.id);

  if (alreadyOwnedIds.length > 0) {
    await db
      .update(requests)
      .set({ status: "approved", reviewedAt: new Date() })
      .where(inArray(requests.id, alreadyOwnedIds));

    const reconciledIndexes = rows.reduce<number[]>((acc, r, i) => {
      if (alreadyOwnedIds.includes(r.id)) acc.push(i);
      return acc;
    }, []);
    await Promise.all(
      reconciledIndexes.map((i) => {
        const r = rows[i];
        const message =
          statuses[i].status === "coming_soon"
            ? `"${r.title}" is already being tracked — it's not released yet.`
            : `"${r.title}" was already in your library.`;
        return createNotification({
          userId: r.requestedByUserId,
          mediaType: r.mediaType,
          tmdbId: r.tmdbId,
          title: r.title,
          eventType: "request_approved",
          message,
        }).catch(() => undefined);
      }),
    );
  }

  return rows.filter((_, i) => statuses[i].status === "untracked");
}

/** Already-reviewed requests (approved or rejected), most recent first — for
 * the admin's Requests page history section below the pending queue. */
export async function getReviewedRequests(limit = 50) {
  return db
    .select({
      id: requests.id,
      mediaType: requests.mediaType,
      tmdbId: requests.tmdbId,
      title: requests.title,
      posterPath: requests.posterPath,
      status: requests.status,
      manuallyApproved: requests.manuallyApproved,
      createdAt: requests.createdAt,
      reviewedAt: requests.reviewedAt,
      requestedByName: users.displayName,
      requestedByUsername: users.username,
    })
    .from(requests)
    .innerJoin(users, eq(users.id, requests.requestedByUserId))
    .where(ne(requests.status, "pending"))
    .orderBy(desc(requests.reviewedAt))
    .limit(limit);
}

/** A member's own requests, most recent first, with a live library-status
 * enrichment on approved ones — so instead of just "Approved" they can see
 * whether it's actually downloading yet or already sitting in the library. */
export async function getMyRequests(userId: string, libraryOwnerId: string) {
  const rows = await db
    .select({
      id: requests.id,
      mediaType: requests.mediaType,
      tmdbId: requests.tmdbId,
      tvdbId: titles.tvdbId,
      title: requests.title,
      posterPath: requests.posterPath,
      status: requests.status,
      manuallyApproved: requests.manuallyApproved,
      createdAt: requests.createdAt,
      reviewedAt: requests.reviewedAt,
    })
    .from(requests)
    .leftJoin(
      titles,
      and(eq(titles.mediaType, requests.mediaType), eq(titles.tmdbId, requests.tmdbId)),
    )
    .where(eq(requests.requestedByUserId, userId))
    .orderBy(desc(requests.createdAt));

  const libraryStatuses = await Promise.all(
    rows.map((r) =>
      r.status === "approved"
        ? getTitleLibraryStatus(libraryOwnerId, r.mediaType, r.tmdbId, r.tvdbId)
            .then((s) => s.status)
            .catch(() => null)
        : Promise.resolve(null),
    ),
  );

  return rows.map((r, i) => ({ ...r, libraryStatus: libraryStatuses[i] }));
}

export async function getPendingRequestCount(): Promise<number> {
  const rows = await db
    .select({ id: requests.id })
    .from(requests)
    .where(eq(requests.status, "pending"));
  return rows.length;
}

/** A member's own pending-review count, for a homepage stat tile — cheaper
 * than getMyRequests since it skips that function's per-request live
 * library-status enrichment, which this doesn't need just to count. */
export async function getMyPendingRequestCount(userId: string): Promise<number> {
  const rows = await db
    .select({ id: requests.id })
    .from(requests)
    .where(and(eq(requests.requestedByUserId, userId), eq(requests.status, "pending")));
  return rows.length;
}

/** Whether this user already has a non-rejected request for this title —
 * used to show "Requested" instead of the request button again, and to
 * block duplicate requests server-side. Rejected requests can be re-sent. */
export async function getActiveRequestStatus(
  userId: string,
  mediaType: MediaType,
  tmdbId: number,
): Promise<RequestStatus | null> {
  const [row] = await db
    .select({ status: requests.status })
    .from(requests)
    .where(
      and(
        eq(requests.requestedByUserId, userId),
        eq(requests.mediaType, mediaType),
        eq(requests.tmdbId, tmdbId),
      ),
    )
    .orderBy(desc(requests.createdAt))
    .limit(1);

  if (!row || row.status === "rejected") return null;
  return row.status;
}

/**
 * Batched version of getActiveRequestStatus for a page rendering many
 * titles at once (franchise/similar-titles rows) — same "non-rejected wins"
 * rule, just keyed per title instead of a single lookup.
 */
export async function getActiveRequestStatusMap(
  userId: string,
  items: { mediaType: MediaType; tmdbId: number }[],
): Promise<Map<string, RequestStatus>> {
  const map = new Map<string, RequestStatus>();
  if (items.length === 0) return map;

  const wanted = new Set(items.map((i) => `${i.mediaType}:${i.tmdbId}`));
  const tmdbIds = [...new Set(items.map((i) => i.tmdbId))];

  const rows = await db
    .select({ mediaType: requests.mediaType, tmdbId: requests.tmdbId, status: requests.status, createdAt: requests.createdAt })
    .from(requests)
    .where(and(eq(requests.requestedByUserId, userId), inArray(requests.tmdbId, tmdbIds)))
    .orderBy(desc(requests.createdAt));

  for (const row of rows) {
    const key = `${row.mediaType}:${row.tmdbId}`;
    if (map.has(key) || row.status === "rejected" || !wanted.has(key)) continue;
    map.set(key, row.status);
  }
  return map;
}

/** Other household members with a pending request for this same title —
 * shown on the title page so a member doesn't duplicate a request a
 * housemate already made. */
export async function getOtherPendingRequesters(
  mediaType: MediaType,
  tmdbId: number,
  excludeUserId: string,
): Promise<string[]> {
  const rows = await db
    .select({ name: users.displayName, username: users.username })
    .from(requests)
    .innerJoin(users, eq(users.id, requests.requestedByUserId))
    .where(
      and(
        eq(requests.status, "pending"),
        eq(requests.mediaType, mediaType),
        eq(requests.tmdbId, tmdbId),
        ne(requests.requestedByUserId, excludeUserId),
      ),
    );

  return rows.map((r) => r.name || r.username);
}
