"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import type { MediaType } from "@/lib/db/schema";
import { getPendingRequestCount } from "@/lib/requests/query";
import { getOpenIssueCount } from "@/lib/issues";
import { canReviewRequests } from "@/lib/users/roles";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { requireReviewer } from "@/lib/auth/require-admin";
import {
  approveAllRequests,
  approveRequest,
  createRequest,
  manuallyApproveRequest,
  rejectRequest,
} from "@/lib/requests/mutate";
import { resolveRejectionReason } from "@/lib/requests/rejection-reasons";

// Thin session/form wrappers — the request lifecycle lives in
// lib/requests/mutate.ts, shared with /api/v1/requests/*.

export type RequestState = { error?: string; success?: boolean };

/** Polled by the nav badge so the admin sees a new request (or problem
 * report) without a manual page refresh — mirrors the notification bell's
 * polling pattern. Both wait on the Requests page. */
export async function getPendingRequestCountAction(): Promise<number> {
  const session = await auth();
  if (!canReviewRequests(session?.user?.role)) return 0;
  const [requests, issues] = await Promise.all([getPendingRequestCount(), getOpenIssueCount()]);
  return requests + issues;
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

  // The arguments are bound in a client component, so they're whatever the
  // browser sends: the type and id have to be real before they reach the
  // database (nothing there constrains media_type), and createRequest takes
  // the title and poster from the TMDb cache rather than trusting these.
  if ((mediaType !== "movie" && mediaType !== "tv") || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return { error: "That title couldn't be requested." };
  }

  const result = await createRequest(viewer, { mediaType, tmdbId, title, posterPath });
  return result.ok ? { success: true } : { error: result.error };
}

/** The title page's season picker. Called directly rather than as a form
 * action since the chosen seasons are component state; `seasons` is whatever
 * the browser sent, and createRequest validates it. */
export async function requestSeasonsAction(tmdbId: number, seasons: unknown): Promise<RequestState> {
  const viewer = await getViewerContext();
  if (!viewer.session) return { error: "Sign in to request titles." };
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) return { error: "That title couldn't be requested." };
  // null would quietly turn this into a whole-series request; the picker
  // always sends a list.
  if (!Array.isArray(seasons)) return { error: "Pick at least one season." };

  const result = await createRequest(viewer, { mediaType: "tv", tmdbId, title: "", posterPath: null, seasons });
  return result.ok ? { success: true } : { error: result.error };
}

/** The title page's "Request in 4K". */
export async function requestFourKAction(mediaType: MediaType, tmdbId: number): Promise<RequestState> {
  const viewer = await getViewerContext();
  if (!viewer.session) return { error: "Sign in to request titles." };
  if ((mediaType !== "movie" && mediaType !== "tv") || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return { error: "That title couldn't be requested." };
  }
  const result = await createRequest(viewer, { mediaType, tmdbId, title: "", posterPath: null, is4k: true });
  return result.ok ? { success: true } : { error: result.error };
}

export type ReviewState = { error?: string; success?: boolean };

export async function approveRequestAction(
  requestId: string,
  _prevState: ReviewState | undefined,
  _formData: FormData,
): Promise<ReviewState> {
  const admin = await requireReviewer("Only an admin can approve requests.");
  if (!admin.ok) return { error: admin.error };

  const result = await approveRequest(requestId, admin.userId);
  revalidatePath("/requests");
  return result.ok ? { success: true } : { error: result.error };
}

export type ApproveAllState = { error?: string; success?: boolean; approvedCount?: number };

/** Approves every currently pending request in one pass — see approveAllRequests. */
export async function approveAllRequestsAction(
  _prevState: ApproveAllState | undefined,
  _formData: FormData,
): Promise<ApproveAllState> {
  const admin = await requireReviewer("Only an admin can approve requests.");
  if (!admin.ok) return { error: admin.error };

  const { approvedCount, failedCount, firstError } = await approveAllRequests(admin.userId);

  if (approvedCount === 0 && firstError) {
    return { error: firstError };
  }
  if (failedCount > 0) {
    return { success: true, approvedCount, error: `${failedCount} request(s) couldn't be approved.` };
  }
  return { success: true, approvedCount };
}

/** Marks a request approved without touching Sonarr/Radarr — see manuallyApproveRequest. */
export async function manuallyApproveRequestAction(
  requestId: string,
  _prevState: ReviewState | undefined,
  _formData: FormData,
): Promise<ReviewState> {
  const admin = await requireReviewer("Only an admin can approve requests.");
  if (!admin.ok) return { error: admin.error };

  const result = await manuallyApproveRequest(requestId, admin.userId);
  return result.ok ? { success: true } : { error: result.error };
}

export async function rejectRequestAction(
  requestId: string,
  _prevState: ReviewState | undefined,
  formData: FormData,
): Promise<ReviewState> {
  const admin = await requireReviewer("Only an admin can reject requests.");
  if (!admin.ok) return { error: admin.error };

  // The row's chooser won't enable Decline until a reason is picked, but the
  // form is just two inputs anyone can post, so the server owns the rule.
  const resolved = resolveRejectionReason({
    preset: formData.get("reason"),
    custom: formData.get("customReason"),
  });
  if (!resolved.ok) return { error: resolved.error };

  const result = await rejectRequest(requestId, admin.userId, resolved.reason);
  return result.ok ? { success: true } : { error: result.error };
}
