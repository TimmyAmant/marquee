"use server";

import { auth } from "@/auth";
import type { MediaType } from "@/lib/db/schema";
import { avatarPath } from "@/lib/users/avatar-path";
import { listShareableUsers, shareTitle } from "@/lib/sharing";

// The website's side of "Send to a household member" — thin wrappers around
// lib/sharing, which /api/v1 shares.

export type ShareMember = { id: string; label: string; avatarUrl: string | null };

export async function listShareMembersAction(): Promise<ShareMember[]> {
  const session = await auth();
  if (!session?.user) return [];
  const rows = await listShareableUsers(session.user.id);
  return rows.map((row) => ({
    id: row.id,
    label: row.displayName || row.username,
    avatarUrl: avatarPath(row, "/api"),
  }));
}

export async function shareTitleAction(
  mediaType: MediaType,
  tmdbId: number,
  userIds: string[],
  note: string,
): Promise<{ error?: string; sharedWith?: number }> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in to share." };
  if ((mediaType !== "movie" && mediaType !== "tv") || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return { error: "That title couldn't be found." };
  }
  const result = await shareTitle(session.user.id, mediaType, tmdbId, { userIds, note });
  return result.ok ? { sharedWith: result.sharedWith } : { error: result.error };
}
