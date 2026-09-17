import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requests, users } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { getActiveRequestStatus } from "@/lib/requests/query";
import { addMovieToRadarrForUser, addSeriesToSonarrForUser } from "@/lib/arr/title-actions";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import { getTitleLibraryStatus } from "@/lib/integrations/status";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { createNotification } from "@/lib/notifications/query";
import { logActivityEvent } from "@/lib/activity/query";
import { getAdminUserId } from "@/lib/auth/get-admin";
import { fail, type CoreFailure, type CoreResult } from "@/lib/core-result";

// Request lifecycle shared by the web's server actions (lib/requests/actions.ts)
// and /api/v1/requests/*. Callers verify who is acting (signed in / admin);
// everything after that lives here.

export async function createRequest(
  viewer: Extract<ViewerIdentity, { userId: string }>,
  input: { mediaType: MediaType; tmdbId: number; title: string; posterPath: string | null },
): Promise<CoreResult<{ requestId: string }>> {
  const { mediaType, tmdbId, title, posterPath } = input;

  const existing = await getActiveRequestStatus(viewer.userId, mediaType, tmdbId);
  if (existing) return fail("conflict", "You've already requested this.");

  // Defense in depth: the Request button is already hidden once a title
  // shows as owned, but re-check server-side since that status can change
  // between page load and submit (e.g. someone else just added it).
  const cachedTitle = await getOrFetchTitle(mediaType, tmdbId).catch(() => null);
  const currentStatus = await getTitleLibraryStatus(
    viewer.libraryOwnerId,
    mediaType,
    tmdbId,
    cachedTitle?.tvdbId ?? null,
  ).catch(() => null);
  if (currentStatus && currentStatus.status !== "untracked") {
    return fail("conflict", "You already have this in your library.");
  }

  // The read-then-write check above can't stop a second concurrent submit
  // (double-click, two tabs) from also passing it — requests_pending_unique_idx
  // is the actual guard; a 23505 here means we lost that race, not a real error.
  const inserted = await db
    .insert(requests)
    .values({
      requestedByUserId: viewer.userId,
      mediaType,
      tmdbId,
      title,
      posterPath,
    })
    .returning({ id: requests.id })
    .then(([row]) => row)
    .catch((err) => {
      if (err && typeof err === "object" && "code" in err && err.code === "23505") return null;
      throw err;
    });
  if (!inserted) return fail("conflict", "You've already requested this.");

  await logActivityEvent({
    actorUserId: viewer.userId,
    eventType: "request_created",
    mediaType,
    tmdbId,
    title,
  }).catch(() => undefined);

  // Admin-set per member (Settings -> household member edit) — if this
  // media type is auto-approved for them, skip straight to the same
  // approval flow the admin's Approve button uses. Falls back to sitting
  // pending (like any failed manual approval) if it errors, e.g. Radarr
  // unreachable or the admin hasn't configured it yet.
  const [requester] = await db
    .select({ autoApproveMovies: users.autoApproveMovies, autoApproveTv: users.autoApproveTv })
    .from(users)
    .where(eq(users.id, viewer.userId));
  const autoApprove = mediaType === "movie" ? requester?.autoApproveMovies : requester?.autoApproveTv;
  if (autoApprove) {
    const adminUserId = await getAdminUserId();
    if (adminUserId) {
      await approveRequest(inserted.id, adminUserId).catch(() => undefined);
    }
  }

  revalidatePath(`/title/${mediaType}/${tmdbId}`);
  revalidatePath("/requests");
  return { ok: true, requestId: inserted.id };
}

/** Shared by the single-request Approve button and "Approve all" — takes an
 * already-verified admin userId so the bulk path doesn't re-check admin on
 * every iteration. */
export async function approveRequest(requestId: string, adminUserId: string): Promise<CoreResult> {
  const [request] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")));
  if (!request) return fail("not_found", "Request not found or already reviewed.");

  // Executes using the approving admin's own Sonarr/Radarr credential —
  // there's no shared/instance-wide credential, only per-user ones.
  const result =
    request.mediaType === "movie"
      ? await addMovieToRadarrForUser(adminUserId, request.tmdbId)
      : await addSeriesToSonarrForUser(adminUserId, request.tmdbId);

  if (!result.ok) return result;

  // Re-guard on status='pending' here too — the initial select above can't
  // stop a concurrent reject from landing between that read and this write,
  // so keep the same atomic "only if still pending" condition the original
  // single UPDATE...WHERE had before this was split into select-then-update.
  const [updated] = await db
    .update(requests)
    .set({ status: "approved", reviewedByUserId: adminUserId, reviewedAt: new Date() })
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")))
    .returning({ id: requests.id });
  if (!updated) return fail("conflict", "Request was already reviewed.");

  await Promise.all([
    createNotification({
      userId: request.requestedByUserId,
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
      title: request.title,
      eventType: "request_approved",
      message: `"${request.title}" was approved — it's on its way to your library.`,
    }).catch(() => undefined),
    logActivityEvent({
      actorUserId: adminUserId,
      eventType: "request_approved",
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
      title: request.title,
    }).catch(() => undefined),
  ]);

  revalidatePath(`/title/${request.mediaType}/${request.tmdbId}`);
  revalidatePath("/discover");
  return { ok: true };
}

export type ApproveAllResult = {
  approvedCount: number;
  failedCount: number;
  firstError: string | null;
  firstFailure: CoreFailure | null;
};

/** Approves every currently pending request in one pass, sequentially (not
 * Promise.all) so a burst of requests doesn't hammer Radarr/Sonarr with
 * simultaneous add calls. Requests that fail (e.g. Radarr unreachable
 * partway through) are left pending rather than silently dropped. */
export async function approveAllRequests(adminUserId: string): Promise<ApproveAllResult> {
  const pending = await db.select({ id: requests.id }).from(requests).where(eq(requests.status, "pending"));

  let approvedCount = 0;
  const failures: CoreFailure[] = [];
  for (const { id } of pending) {
    const result = await approveRequest(id, adminUserId);
    if (result.ok) {
      approvedCount++;
    } else {
      failures.push(result);
    }
  }

  revalidatePath("/requests");
  return {
    approvedCount,
    failedCount: failures.length,
    firstError: failures[0]?.error ?? null,
    firstFailure: failures[0] ?? null,
  };
}

/** For requests Sonarr/Radarr can't add automatically (e.g. no TVDB id to
 * resolve) but the admin is downloading by hand anyway. Marks the request
 * approved without touching Sonarr/Radarr, and flags it so the requester
 * sees "Manually approved" instead of the normal approved status. */
export async function manuallyApproveRequest(requestId: string, adminUserId: string): Promise<CoreResult> {
  const [request] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")));
  if (!request) return fail("not_found", "Request not found or already reviewed.");

  const [updated] = await db
    .update(requests)
    .set({
      status: "approved",
      manuallyApproved: true,
      reviewedByUserId: adminUserId,
      reviewedAt: new Date(),
    })
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")))
    .returning({ id: requests.id });
  if (!updated) return fail("conflict", "Request was already reviewed.");

  await Promise.all([
    createNotification({
      userId: request.requestedByUserId,
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
      title: request.title,
      eventType: "request_approved",
      message: `"${request.title}" was manually approved — the admin is adding it outside of Sonarr/Radarr.`,
    }).catch(() => undefined),
    logActivityEvent({
      actorUserId: adminUserId,
      eventType: "request_manually_approved",
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
      title: request.title,
    }).catch(() => undefined),
  ]);

  revalidatePath(`/title/${request.mediaType}/${request.tmdbId}`);
  revalidatePath("/requests");
  return { ok: true };
}

export async function rejectRequest(requestId: string, adminUserId: string): Promise<CoreResult> {
  const [request] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")));
  if (!request) return fail("not_found", "Request not found or already reviewed.");

  // Same atomic re-guard as approveRequest — see comment there.
  const [updated] = await db
    .update(requests)
    .set({ status: "rejected", reviewedByUserId: adminUserId, reviewedAt: new Date() })
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")))
    .returning({ id: requests.id });
  if (!updated) return fail("conflict", "Request was already reviewed.");

  await Promise.all([
    createNotification({
      userId: request.requestedByUserId,
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
      title: request.title,
      eventType: "request_rejected",
      message: `"${request.title}" was declined.`,
    }).catch(() => undefined),
    logActivityEvent({
      actorUserId: adminUserId,
      eventType: "request_rejected",
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
      title: request.title,
    }).catch(() => undefined),
  ]);

  revalidatePath("/requests");
  return { ok: true };
}
