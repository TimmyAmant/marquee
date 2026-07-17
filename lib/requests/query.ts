import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requests, users, titles } from "@/lib/db/schema";
import type { MediaType, RequestStatus } from "@/lib/db/schema";
import { getTitleLibraryStatus } from "@/lib/integrations/status";

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
      requestedByName: users.displayName,
      requestedByEmail: users.email,
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
  }

  return rows.filter((_, i) => statuses[i].status === "untracked");
}

export async function getPendingRequestCount(): Promise<number> {
  const rows = await db
    .select({ id: requests.id })
    .from(requests)
    .where(eq(requests.status, "pending"));
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
