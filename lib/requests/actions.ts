"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { requests } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { getActiveRequestStatus, getPendingRequestCount } from "@/lib/requests/query";
import { addMovieToRadarrForUser, addSeriesToSonarrForUser } from "@/app/title/[type]/[id]/actions";
import { getLibraryOwnerUserId } from "@/lib/integrations/library-owner";
import { getTitleLibraryStatus } from "@/lib/integrations/status";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { createNotification } from "@/lib/notifications/query";

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
  const session = await auth();
  if (!session?.user) return { error: "Sign in to request titles." };

  const existing = await getActiveRequestStatus(session.user.id, mediaType, tmdbId);
  if (existing) return { error: "You've already requested this." };

  // Defense in depth: the Request button is already hidden once a title
  // shows as owned, but re-check server-side since that status can change
  // between page load and submit (e.g. someone else just added it).
  const libraryOwnerId = await getLibraryOwnerUserId(session.user.id);
  const cachedTitle = await getOrFetchTitle(mediaType, tmdbId).catch(() => null);
  const currentStatus = await getTitleLibraryStatus(
    libraryOwnerId,
    mediaType,
    tmdbId,
    cachedTitle?.tvdbId ?? null,
  ).catch(() => null);
  if (currentStatus && currentStatus.status !== "untracked") {
    return { error: "You already have this in your library." };
  }

  await db.insert(requests).values({
    requestedByUserId: session.user.id,
    mediaType,
    tmdbId,
    title,
    posterPath,
  });

  revalidatePath(`/title/${mediaType}/${tmdbId}`);
  revalidatePath("/requests");
  return { success: true };
}

export type ReviewState = { error?: string; success?: boolean };

export async function approveRequestAction(
  requestId: string,
  _prevState: ReviewState | undefined,
  _formData: FormData,
): Promise<ReviewState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in required." };
  if (session.user.role !== "admin") return { error: "Only an admin can approve requests." };

  const [request] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")));
  if (!request) return { error: "Request not found or already reviewed." };

  // Executes using the approving admin's own Sonarr/Radarr credential —
  // there's no shared/instance-wide credential, only per-user ones.
  const result =
    request.mediaType === "movie"
      ? await addMovieToRadarrForUser(session.user.id, request.tmdbId)
      : await addSeriesToSonarrForUser(session.user.id, request.tmdbId);

  if (result.error) return { error: result.error };

  await db
    .update(requests)
    .set({ status: "approved", reviewedByUserId: session.user.id, reviewedAt: new Date() })
    .where(eq(requests.id, requestId));

  await createNotification({
    userId: request.requestedByUserId,
    mediaType: request.mediaType,
    tmdbId: request.tmdbId,
    title: request.title,
    eventType: "request_approved",
    message: `"${request.title}" was approved — it's on its way to your library.`,
  }).catch(() => undefined);

  revalidatePath("/requests");
  revalidatePath("/library");
  return { success: true };
}

export async function rejectRequestAction(
  requestId: string,
  _prevState: ReviewState | undefined,
  _formData: FormData,
): Promise<ReviewState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in required." };
  if (session.user.role !== "admin") return { error: "Only an admin can reject requests." };

  const [request] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")));
  if (!request) return { error: "Request not found or already reviewed." };

  await db
    .update(requests)
    .set({ status: "rejected", reviewedByUserId: session.user.id, reviewedAt: new Date() })
    .where(eq(requests.id, requestId));

  await createNotification({
    userId: request.requestedByUserId,
    mediaType: request.mediaType,
    tmdbId: request.tmdbId,
    title: request.title,
    eventType: "request_rejected",
    message: `"${request.title}" was declined.`,
  }).catch(() => undefined);

  revalidatePath("/requests");
  return { success: true };
}
