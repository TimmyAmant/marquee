import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requests, users } from "@/lib/db/schema";
import type { MediaType, RequestStatus } from "@/lib/db/schema";

export async function getPendingRequests() {
  return db
    .select({
      id: requests.id,
      mediaType: requests.mediaType,
      tmdbId: requests.tmdbId,
      title: requests.title,
      posterPath: requests.posterPath,
      createdAt: requests.createdAt,
      requestedByName: users.displayName,
      requestedByEmail: users.email,
    })
    .from(requests)
    .innerJoin(users, eq(users.id, requests.requestedByUserId))
    .where(eq(requests.status, "pending"))
    .orderBy(desc(requests.createdAt));
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
