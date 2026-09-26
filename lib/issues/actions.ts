"use server";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/auth/require-admin";
import { can } from "@/lib/users/permissions";
import type { MediaType } from "@/lib/db/schema";
import { deleteIssue, reportIssue, resolveIssue, searchAgainForIssue, type ReportInput } from "@/lib/issues";
import { getT } from "@/lib/i18n/server";

// The website's side of problem reports — thin wrappers around lib/issues,
// which /api/v1/issues shares.

export type IssueActionState = { error?: string; success?: boolean };

export async function reportIssueAction(
  mediaType: MediaType,
  tmdbId: number,
  input: ReportInput,
): Promise<IssueActionState> {
  const session = await auth();
  if (!session?.user) return { error: (await getT())("notify.signInToReport") };
  if ((mediaType !== "movie" && mediaType !== "tv") || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return { error: (await getT())("notify.titleNotFound") };
  }
  const result = await reportIssue(session.user.id, mediaType, tmdbId, input);
  return result.ok ? { success: true } : { error: result.error };
}

export async function resolveIssueAction(issueId: string, note: string): Promise<IssueActionState> {
  const admin = await requirePermission("manageIssues", (await getT())("notify.onlyAdminResolves"));
  if (!admin.ok) return { error: admin.error };
  const result = await resolveIssue(admin.userId, issueId, note);
  return result.ok ? { success: true } : { error: result.error };
}

export async function searchAgainAction(issueId: string): Promise<IssueActionState> {
  const admin = await requirePermission("manageIssues", (await getT())("notify.onlyAdminSearches"));
  if (!admin.ok) return { error: admin.error };
  const result = await searchAgainForIssue(admin.userId, issueId);
  return result.ok ? { success: true } : { error: result.error };
}

export async function deleteIssueAction(issueId: string): Promise<IssueActionState> {
  const session = await auth();
  if (!session?.user) return { error: (await getT())("notify.signInFirst") };
  const result = await deleteIssue({ userId: session.user.id, managesIssues: can(session.user, "manageIssues") }, issueId);
  return result.ok ? { success: true } : { error: result.error };
}
