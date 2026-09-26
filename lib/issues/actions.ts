"use server";

import { auth } from "@/auth";
import { requireReviewer } from "@/lib/auth/require-admin";
import { canReviewRequests } from "@/lib/users/roles";
import type { MediaType } from "@/lib/db/schema";
import { deleteIssue, reportIssue, resolveIssue, searchAgainForIssue, type ReportInput } from "@/lib/issues";

// The website's side of problem reports — thin wrappers around lib/issues,
// which /api/v1/issues shares.

export type IssueActionState = { error?: string; success?: boolean };

export async function reportIssueAction(
  mediaType: MediaType,
  tmdbId: number,
  input: ReportInput,
): Promise<IssueActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in to report a problem." };
  if ((mediaType !== "movie" && mediaType !== "tv") || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return { error: "That title couldn't be found." };
  }
  const result = await reportIssue(session.user.id, mediaType, tmdbId, input);
  return result.ok ? { success: true } : { error: result.error };
}

export async function resolveIssueAction(issueId: string, note: string): Promise<IssueActionState> {
  const admin = await requireReviewer("Only the admin can resolve problem reports.");
  if (!admin.ok) return { error: admin.error };
  const result = await resolveIssue(admin.userId, issueId, note);
  return result.ok ? { success: true } : { error: result.error };
}

export async function searchAgainAction(issueId: string): Promise<IssueActionState> {
  const admin = await requireReviewer("Only the admin can search for titles.");
  if (!admin.ok) return { error: admin.error };
  const result = await searchAgainForIssue(admin.userId, issueId);
  return result.ok ? { success: true } : { error: result.error };
}

export async function deleteIssueAction(issueId: string): Promise<IssueActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in first." };
  const result = await deleteIssue({ userId: session.user.id, isAdmin: canReviewRequests(session.user.role) }, issueId);
  return result.ok ? { success: true } : { error: result.error };
}
