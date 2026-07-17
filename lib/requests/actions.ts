"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { requests } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { getActiveRequestStatus } from "@/lib/requests/query";
import { addMovieToRadarrForUser, addSeriesToSonarrForUser } from "@/app/title/[type]/[id]/actions";

export type RequestState = { error?: string; success?: boolean };

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

  await db
    .update(requests)
    .set({ status: "rejected", reviewedByUserId: session.user.id, reviewedAt: new Date() })
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")));

  revalidatePath("/requests");
  return { success: true };
}
