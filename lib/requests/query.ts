import { and, count, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { getFourKStatus } from "@/lib/arr/fourk";
import { db } from "@/lib/db/client";
import { requests, users, titles } from "@/lib/db/schema";
import type { MediaType, RequestStatus } from "@/lib/db/schema";
import { getSonarrSeasonStates, getTitleLibraryStatus } from "@/lib/integrations/status";
import { createNotification } from "@/lib/notifications/query";
import { mapWithLimit } from "@/lib/async/map-limit";
import { quotedRequestTitle } from "@/lib/requests/labels";
import { seasonsStillNeeded, type ViewerTitleRequest } from "@/lib/requests/seasons";
import { countComments } from "@/lib/comments";
import type { LibraryStatus } from "@/components/status-badge";

// Each row's library status can be a live Sonarr/Radarr lookup — a long
// queue shouldn't fire them all at the admin's home server at once.
const STATUS_LOOKUP_CONCURRENCY = 6;

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
      seasons: requests.seasons,
      is4k: requests.is4k,
      createdAt: requests.createdAt,
      editedAt: requests.editedAt,
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

  // A season request is usually for more of a show that's already in the
  // library, so the show being tracked says nothing about it: it only goes
  // stale once every season it asks for is monitored or complete in Sonarr
  // (reported here as "seasons_covered").
  const statuses: { status: LibraryStatus | "seasons_covered" }[] = await mapWithLimit(
    rows,
    STATUS_LOOKUP_CONCURRENCY,
    async (r) => {
      // A 4K request is covered by the 4K instance, never by the main
      // library (owning it in HD is why someone asks for 4K).
      if (r.is4k) {
        const fourK = await getFourKStatus(viewerUserId, r.mediaType, r.tmdbId, r.tvdbId).catch(() => null);
        return { status: fourK?.status ?? ("untracked" as const) };
      }
      if (r.seasons) {
        const library = await getSonarrSeasonStates(viewerUserId, r.tvdbId).catch(() => null);
        const covered = library !== null && seasonsStillNeeded(r.seasons, library).length === 0;
        return { status: covered ? ("seasons_covered" as const) : ("untracked" as const) };
      }
      if (r.mediaType === "tv") {
        // A whole-series request for a show Sonarr has only some seasons of
        // (a housemate's season request added it) isn't covered yet: only
        // once every season is monitored or complete there. A show Sonarr
        // doesn't track falls through to the usual owned-anywhere check.
        const library = await getSonarrSeasonStates(viewerUserId, r.tvdbId).catch(() => null);
        const everySeason = (library ?? []).filter((s) => s.seasonNumber > 0).map((s) => s.seasonNumber);
        // Sonarr listing only specials says nothing yet: fall through.
        if (library && everySeason.length > 0) {
          const covered = seasonsStillNeeded(everySeason, library).length === 0;
          return { status: covered ? ("seasons_covered" as const) : ("untracked" as const) };
        }
      }
      return getTitleLibraryStatus(viewerUserId, r.mediaType, r.tmdbId, r.tvdbId).catch(
        () => ({ status: "untracked" as const, provider: null, configured: false, file: null }),
      );
    },
  );

  const alreadyOwnedIds = rows
    .filter((_, i) => statuses[i].status !== "untracked")
    .map((r) => r.id);

  if (alreadyOwnedIds.length > 0) {
    // Only flip requests that are still pending: the admin may have rejected
    // (or approved) one while the lookups above were running, and this must
    // neither overwrite that decision nor notify the requester twice. Only
    // the rows this update actually changed get a notification.
    const reconciled = await db
      .update(requests)
      .set({ status: "approved", reviewedAt: new Date() })
      .where(and(inArray(requests.id, alreadyOwnedIds), eq(requests.status, "pending")))
      .returning({ id: requests.id });
    const reconciledIds = new Set(reconciled.map((r) => r.id));

    await Promise.all(
      rows.flatMap((r, i) => {
        if (!reconciledIds.has(r.id)) return [];
        const message = r.is4k
          ? `"${r.title}" is already in the 4K library or on its way.`
          : statuses[i].status === "seasons_covered"
            ? `${quotedRequestTitle(r.title, r.seasons)} is already in your library or on its way.`
            : statuses[i].status === "coming_soon"
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
 * the admin's Requests page history section below the pending queue. Every
 * request under "Couldn't add" is included however old, first. */
export async function getReviewedRequests(limit = 50) {
  const [failed, recent] = await Promise.all([
    reviewedQuery()
      .where(and(eq(requests.status, "approved"), isNotNull(requests.addFailedAt)))
      .orderBy(desc(requests.reviewedAt)),
    reviewedQuery().where(ne(requests.status, "pending")).orderBy(desc(requests.reviewedAt)).limit(limit),
  ]);
  const failedIds = new Set(failed.map((r) => r.id));
  return [...failed, ...recent.filter((r) => !failedIds.has(r.id))];
}

/** Approved, but Sonarr/Radarr couldn't be reached to add it. */
export async function getFailedRequestCount(): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(requests)
    .where(and(eq(requests.status, "approved"), isNotNull(requests.addFailedAt)));
  return row?.count ?? 0;
}

function reviewedQuery() {
  return db
    .select({
      id: requests.id,
      mediaType: requests.mediaType,
      tmdbId: requests.tmdbId,
      title: requests.title,
      posterPath: requests.posterPath,
      seasons: requests.seasons,
      is4k: requests.is4k,
      status: requests.status,
      manuallyApproved: requests.manuallyApproved,
      rejectionReason: requests.rejectionReason,
      createdAt: requests.createdAt,
      reviewedAt: requests.reviewedAt,
      requestedByName: users.displayName,
      requestedByUsername: users.username,
      arrServerId: requests.arrServerId,
      arrServerName: requests.arrServerName,
      arrQualityProfileId: requests.arrQualityProfileId,
      arrRootFolderPath: requests.arrRootFolderPath,
      arrTags: requests.arrTags,
      arrSeriesType: requests.arrSeriesType,
      notFoundSince: requests.notFoundSince,
      addFailedAt: requests.addFailedAt,
      addError: requests.addError,
      requestedByUserId: requests.requestedByUserId,
    })
    .from(requests)
    .innerJoin(users, eq(users.id, requests.requestedByUserId))
    .$dynamic();
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
      seasons: requests.seasons,
      is4k: requests.is4k,
      status: requests.status,
      manuallyApproved: requests.manuallyApproved,
      rejectionReason: requests.rejectionReason,
      createdAt: requests.createdAt,
      reviewedAt: requests.reviewedAt,
      editedAt: requests.editedAt,
      addFailedAt: requests.addFailedAt,
    })
    .from(requests)
    .leftJoin(
      titles,
      and(eq(titles.mediaType, requests.mediaType), eq(titles.tmdbId, requests.tmdbId)),
    )
    .where(eq(requests.requestedByUserId, userId))
    .orderBy(desc(requests.createdAt));

  const libraryStatuses = await mapWithLimit(rows, STATUS_LOOKUP_CONCURRENCY, (r) => {
    if (r.status !== "approved") return Promise.resolve(null);
    if (r.is4k) {
      return getFourKStatus(libraryOwnerId, r.mediaType, r.tmdbId, r.tvdbId)
        .then((s) => s?.status ?? null)
        .catch(() => null);
    }
    // An approved season request is "in your library" only once every
    // season it asked for is complete — the show as a whole being owned
    // (the seasons already there) says nothing about the new ones. Until
    // then it reads "Approved".
    if (r.seasons) {
      return getSonarrSeasonStates(libraryOwnerId, r.tvdbId)
        .then((library) => {
          const done = new Set((library ?? []).filter((s) => s.complete).map((s) => s.seasonNumber));
          return library && r.seasons!.every((n) => done.has(n)) ? ("owned" as const) : null;
        })
        .catch(() => null);
    }
    return getTitleLibraryStatus(libraryOwnerId, r.mediaType, r.tmdbId, r.tvdbId)
      .then((s) => s.status)
      .catch(() => null);
  });

  return rows.map((r, i) => ({ ...r, libraryStatus: libraryStatuses[i] }));
}

export async function getPendingRequestCount(): Promise<number> {
  const rows = await db
    .select({ id: requests.id })
    .from(requests)
    .where(eq(requests.status, "pending"));
  return rows.length;
}

/** Every request ever made, any status — for the Settings → About stats
 * panel, not a queue view, so it doesn't reconcile/filter like
 * getPendingRequests does. */
export async function getTotalRequestCount(): Promise<number> {
  const [row] = await db.select({ count: count() }).from(requests);
  return row?.count ?? 0;
}

/** Whether this user already has a non-rejected request for this title —
 * used to show "Requested" instead of the request button again, and to
 * block duplicate requests server-side. Rejected requests can be re-sent. */
export async function getActiveRequestStatus(
  userId: string,
  mediaType: MediaType,
  tmdbId: number,
  /** The 4K request instead of the regular one; they're separate. */
  fourK = false,
): Promise<RequestStatus | null> {
  const [row] = await db
    .select({ status: requests.status })
    .from(requests)
    .where(
      and(
        eq(requests.requestedByUserId, userId),
        eq(requests.mediaType, mediaType),
        eq(requests.tmdbId, tmdbId),
        eq(requests.is4k, fourK),
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
    .where(and(eq(requests.requestedByUserId, userId), inArray(requests.tmdbId, tmdbIds), eq(requests.is4k, false)))
    .orderBy(desc(requests.createdAt));

  for (const row of rows) {
    const key = `${row.mediaType}:${row.tmdbId}`;
    if (map.has(key) || row.status === "rejected" || !wanted.has(key)) continue;
    map.set(key, row.status);
  }
  return map;
}

/** This user's pending and approved requests for one title, with their
 * seasons — what the title page needs to tell which seasons they've already
 * asked for, and whether a new season request would be a duplicate. */
export async function getViewerTitleRequests(
  userId: string,
  mediaType: MediaType,
  tmdbId: number,
): Promise<ViewerTitleRequest[]> {
  const rows = await db
    .select({ status: requests.status, seasons: requests.seasons })
    .from(requests)
    .where(
      and(
        eq(requests.requestedByUserId, userId),
        eq(requests.mediaType, mediaType),
        eq(requests.tmdbId, tmdbId),
        ne(requests.status, "rejected"),
        eq(requests.is4k, false),
      ),
    )
    .orderBy(desc(requests.createdAt));
  return rows.flatMap((r) =>
    r.status === "pending" || r.status === "approved" ? [{ status: r.status, seasons: r.seasons }] : [],
  );
}

/** This user's own requests for one title, regular and 4K, newest first
 * (at most five), with how many comments each has — the title page's
 * Cancel / Edit and conversations. */
export async function getViewerRequestsForTitle(userId: string, mediaType: MediaType, tmdbId: number) {
  const rows = await db
    .select({
      id: requests.id,
      status: requests.status,
      seasons: requests.seasons,
      is4k: requests.is4k,
      createdAt: requests.createdAt,
    })
    .from(requests)
    .where(and(eq(requests.requestedByUserId, userId), eq(requests.mediaType, mediaType), eq(requests.tmdbId, tmdbId)))
    .orderBy(desc(requests.createdAt))
    .limit(5);
  const counts = await countComments(
    "request",
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({ ...r, commentCount: counts.get(r.id) ?? 0 }));
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
        eq(requests.is4k, false),
      ),
    );

  return rows.map((r) => r.name || r.username);
}
