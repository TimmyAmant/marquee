"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { requests, users } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { getActiveRequestStatus, getPendingRequestCount } from "@/lib/requests/query";
import { addMovieToRadarrForUser, addSeriesToSonarrForUser } from "@/app/title/[type]/[id]/actions";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { getTitleLibraryStatus } from "@/lib/integrations/status";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { createNotification } from "@/lib/notifications/query";
import { logActivityEvent } from "@/lib/activity/query";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminUserId } from "@/lib/auth/get-admin";

export type RequestState = { error?: string; success?: boolean };

/** Polled by the nav badge so the admin sees a new request without a manual
 * page refresh — mirrors the notification bell's polling pattern. */
export async function getPendingRequestCountAction(): Promise<number> {
  const session = await auth();
  if (session?.user?.role !== "admin") return 0;
  return getPendingRequestCount();
}

export async function createRequestAction(
  mediaType: MediaType,
  tmdbId: number,
  title: string,
  posterPath: string | null,
  _prevState: RequestState | undefined,
  _formData: FormData,
): Promise<RequestState> {
  const viewer = await getViewerContext();
  if (!viewer.session) return { error: "Sign in to request titles." };

  const existing = await getActiveRequestStatus(viewer.userId, mediaType, tmdbId);
  if (existing) return { error: "You've already requested this." };

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
    return { error: "You already have this in your library." };
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
  if (!inserted) return { error: "You've already requested this." };

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
      await approveRequestCore(inserted.id, adminUserId).catch(() => undefined);
    }
  }

  revalidatePath(`/title/${mediaType}/${tmdbId}`);
  revalidatePath("/requests");
  return { success: true };
}

export type ReviewState = { error?: string; success?: boolean };

/** Shared by the single-request Approve button and "Approve all" — takes an
 * already-verified admin userId so the bulk path doesn't re-check admin on
 * every iteration. */
async function approveRequestCore(requestId: string, adminUserId: string): Promise<ReviewState> {
  const [request] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")));
  if (!request) return { error: "Request not found or already reviewed." };

  // Executes using the approving admin's own Sonarr/Radarr credential —
  // there's no shared/instance-wide credential, only per-user ones.
  const result =
    request.mediaType === "movie"
      ? await addMovieToRadarrForUser(adminUserId, request.tmdbId)
      : await addSeriesToSonarrForUser(adminUserId, request.tmdbId);

  if (result.error) return { error: result.error };

  // Re-guard on status='pending' here too — the initial select above can't
  // stop a concurrent reject from landing between that read and this write,
  // so keep the same atomic "only if still pending" condition the original
  // single UPDATE...WHERE had before this was split into select-then-update.
  const [updated] = await db
    .update(requests)
    .set({ status: "approved", reviewedByUserId: adminUserId, reviewedAt: new Date() })
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")))
    .returning({ id: requests.id });
  if (!updated) return { error: "Request was already reviewed." };

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
  return { success: true };
}

export async function approveRequestAction(
  requestId: string,
  _prevState: ReviewState | undefined,
  _formData: FormData,
): Promise<ReviewState> {
  const admin = await requireAdmin("Only an admin can approve requests.");
  if (!admin.ok) return { error: admin.error };

  const result = await approveRequestCore(requestId, admin.userId);
  revalidatePath("/requests");
  return result;
}

export type ApproveAllState = { error?: string; success?: boolean; approvedCount?: number };

/** Approves every currently pending request in one pass, sequentially (not
 * Promise.all) so a burst of requests doesn't hammer Radarr/Sonarr with
 * simultaneous add calls. Requests that fail (e.g. Radarr unreachable
 * partway through) are left pending rather than silently dropped — the
 * admin can retry them individually or hit "Approve all" again. */
export async function approveAllRequestsAction(
  _prevState: ApproveAllState | undefined,
  _formData: FormData,
): Promise<ApproveAllState> {
  const admin = await requireAdmin("Only an admin can approve requests.");
  if (!admin.ok) return { error: admin.error };

  const pending = await db
    .select({ id: requests.id })
    .from(requests)
    .where(eq(requests.status, "pending"));

  let approvedCount = 0;
  const errors: string[] = [];
  for (const { id } of pending) {
    const result = await approveRequestCore(id, admin.userId);
    if (result.success) {
      approvedCount++;
    } else if (result.error) {
      errors.push(result.error);
    }
  }

  revalidatePath("/requests");

  if (approvedCount === 0 && errors.length > 0) {
    return { error: errors[0] };
  }
  if (errors.length > 0) {
    return { success: true, approvedCount, error: `${errors.length} request(s) couldn't be approved.` };
  }
  return { success: true, approvedCount };
}

/** For requests Sonarr/Radarr can't add automatically (e.g. no TVDB id to
 * resolve) but the admin is downloading by hand anyway. Marks the request
 * approved without touching Sonarr/Radarr, and flags it so the requester
 * sees "Manually approved" instead of the normal approved status — which
 * would otherwise stay stuck on "untracked" forever since nothing ever
 * actually lands in Sonarr/Radarr's own database for it. */
export async function manuallyApproveRequestAction(
  requestId: string,
  _prevState: ReviewState | undefined,
  _formData: FormData,
): Promise<ReviewState> {
  const admin = await requireAdmin("Only an admin can approve requests.");
  if (!admin.ok) return { error: admin.error };

  const [request] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")));
  if (!request) return { error: "Request not found or already reviewed." };

  const [updated] = await db
    .update(requests)
    .set({
      status: "approved",
      manuallyApproved: true,
      reviewedByUserId: admin.userId,
      reviewedAt: new Date(),
    })
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")))
    .returning({ id: requests.id });
  if (!updated) return { error: "Request was already reviewed." };

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
      actorUserId: admin.userId,
      eventType: "request_manually_approved",
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
      title: request.title,
    }).catch(() => undefined),
  ]);

  revalidatePath(`/title/${request.mediaType}/${request.tmdbId}`);
  revalidatePath("/requests");
  return { success: true };
}

export async function rejectRequestAction(
  requestId: string,
  _prevState: ReviewState | undefined,
  _formData: FormData,
): Promise<ReviewState> {
  const admin = await requireAdmin("Only an admin can reject requests.");
  if (!admin.ok) return { error: admin.error };

  const [request] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")));
  if (!request) return { error: "Request not found or already reviewed." };

  // Same atomic re-guard as approveRequestAction — see comment there.
  const [updated] = await db
    .update(requests)
    .set({ status: "rejected", reviewedByUserId: admin.userId, reviewedAt: new Date() })
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")))
    .returning({ id: requests.id });
  if (!updated) return { error: "Request was already reviewed." };

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
      actorUserId: admin.userId,
      eventType: "request_rejected",
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
      title: request.title,
    }).catch(() => undefined),
  ]);

  revalidatePath("/requests");
  return { success: true };
}
