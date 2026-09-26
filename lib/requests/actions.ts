"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import type { MediaType } from "@/lib/db/schema";
import { getFailedRequestCount, getPendingRequestCount } from "@/lib/requests/query";
import { getOpenIssueCount } from "@/lib/issues";
import { dismissNotFound, getNotFoundCount, searchNotFoundAgain } from "@/lib/requests/not-found";
import { canReviewRequests } from "@/lib/users/roles";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { requireAdmin, requireReviewer } from "@/lib/auth/require-admin";
import {
  approveAllRequests,
  approveRequest,
  cancelRequest,
  createRequest,
  editRequest,
  manuallyApproveRequest,
  rejectRequest,
  retryRequest,
} from "@/lib/requests/mutate";
import { resolveRejectionReason } from "@/lib/requests/rejection-reasons";
import { hasOverrides, parseAddOverridesForm } from "@/lib/arr/add-options";
import { requestAllMissing } from "@/lib/requests/request-all";
import { getRequestEditOptions } from "@/lib/requests/edit-options";
import type { RequestEditOptions } from "@/lib/api/types";

// Thin session/form wrappers — the request lifecycle lives in
// lib/requests/mutate.ts, shared with /api/v1/requests/*.

export type RequestState = { error?: string; success?: boolean };

/** Polled by the nav badge so the admin sees a new request (or problem
 * report, or a request Sonarr/Radarr can't find) without a manual page
 * refresh — mirrors the notification bell's polling pattern. All of them
 * wait on the Requests page. */
export async function getPendingRequestCountAction(): Promise<number> {
  const session = await auth();
  if (!canReviewRequests(session?.user?.role)) return 0;
  const [requests, issues, notFound, failed] = await Promise.all([
    getPendingRequestCount(),
    getOpenIssueCount(),
    getNotFoundCount(),
    getFailedRequestCount(),
  ]);
  return requests + issues + notFound + failed;
}

/** "Can't find" → "Search again". */
export async function searchNotFoundAgainAction(requestId: string): Promise<RequestState> {
  await requireReviewer();
  const result = await searchNotFoundAgain(requestId);
  if (!result.ok) return { error: result.error };
  return { success: true };
}

/** "Can't find" → "Mark as found". */
export async function dismissNotFoundAction(requestId: string): Promise<RequestState> {
  await requireReviewer();
  const result = await dismissNotFound(requestId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/requests");
  return { success: true };
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

/** A franchise row's "Request all N missing", from the title page it sits
 * on — the server works out the set itself (lib/requests/request-all.ts). */
export async function requestAllMissingAction(
  mediaType: MediaType,
  tmdbId: number,
): Promise<{ error?: string; message?: string; requested?: number }> {
  const viewer = await getViewerContext();
  if (!viewer.session) return { error: "Sign in to request titles." };
  if ((mediaType !== "movie" && mediaType !== "tv") || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return { error: "That title couldn't be requested." };
  }
  const result = await requestAllMissing(viewer, mediaType, tmdbId);
  return result.ok ? { message: result.message, requested: result.requested } : { error: result.error };
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
  formData: FormData,
): Promise<ReviewState> {
  const admin = await requireReviewer("Only an admin can approve requests.");
  if (!admin.ok) return { error: admin.error };

  // The row's "Advanced" picks, when it was opened (components/add-advanced-options.tsx).
  const parsed = parseAddOverridesForm(formData, "tv");
  if (!parsed.ok) return { error: parsed.error };
  const result = await approveRequest(requestId, admin.userId, parsed.overrides);
  revalidatePath("/requests");
  // Approved but not added: it moves to "Couldn't add" (with its error and
  // a Retry), so this row's job is done.
  if (!result.ok && "addFailed" in result) return { success: true };
  return result.ok ? { success: true } : { error: result.error };
}

/** "Retry" under "Couldn't add", with the row's Advanced picks if opened. */
export async function retryRequestAction(
  requestId: string,
  _prevState: ReviewState | undefined,
  formData: FormData,
): Promise<ReviewState> {
  const admin = await requireReviewer("Only an admin can retry requests.");
  if (!admin.ok) return { error: admin.error };
  const parsed = parseAddOverridesForm(formData, "tv");
  if (!parsed.ok) return { error: parsed.error };
  const result = await retryRequest(requestId, admin.userId, hasOverrides(parsed.overrides) ? parsed.overrides : undefined);
  revalidatePath("/requests");
  return result.ok ? { success: true } : { error: result.error };
}

/** What "Edit" can offer for a pending request (lib/requests/edit-options.ts). */
export async function requestEditOptionsAction(
  requestId: string,
): Promise<{ options?: RequestEditOptions; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in first." };
  if (typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId)) return { error: "Request not found." };
  const result = await getRequestEditOptions({ userId: session.user.id, role: session.user.role }, requestId);
  return result.ok ? { options: result.options } : { error: result.error };
}

/** "Cancel request" — the requester's own, while it's pending. */
export async function cancelRequestAction(requestId: string): Promise<RequestState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in first." };
  if (typeof requestId !== "string") return { error: "Request not found." };
  const result = await cancelRequest({ userId: session.user.id, role: session.user.role }, requestId);
  return result.ok ? { success: true } : { error: result.error };
}

/** "Edit" on a pending request: its seasons (TV) and/or 4K. The requester's
 * own, or anyone's for a reviewer. Both values are whatever the browser
 * sent; editRequest checks them. `seasons` undefined leaves them as they are. */
export async function editRequestAction(
  requestId: string,
  change: { seasons?: unknown; is4k?: unknown },
): Promise<RequestState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in first." };
  if (typeof requestId !== "string" || !change || typeof change !== "object") return { error: "Request not found." };
  const result = await editRequest({ userId: session.user.id, role: session.user.role }, requestId, {
    seasons: "seasons" in change ? change.seasons : undefined,
    is4k: "is4k" in change ? change.is4k : undefined,
  });
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
  // Admin only: it tells the requester the admin is adding it by hand.
  const admin = await requireAdmin("Only the admin can mark a request as added by hand.");
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
