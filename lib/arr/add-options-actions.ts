"use server";

import { auth } from "@/auth";
import type { MediaType } from "@/lib/db/schema";
import { canReviewRequests } from "@/lib/users/roles";
import { getAdminUserId } from "@/lib/auth/get-admin";
import { getAddOptions, type AddOptions } from "@/lib/arr/add-options-server";

/** The website's "Advanced" section under Approve (and the admin's Add):
 * the servers a title could go to, with their pickers and defaults. For
 * the admin and trusted members — always the admin's servers. */
export async function getAddOptionsAction(
  mediaType: MediaType,
  tmdbId: number,
  fourK: boolean,
): Promise<{ ok: true; options: AddOptions } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user || !canReviewRequests(session.user.role)) {
    return { ok: false, error: "Only an admin can approve requests." };
  }
  if ((mediaType !== "movie" && mediaType !== "tv") || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return { ok: false, error: "That title couldn't be found." };
  }
  const ownerId = session.user.role === "admin" ? session.user.id : await getAdminUserId();
  if (!ownerId) return { ok: false, error: "There's no admin account to add titles with." };
  return { ok: true, options: await getAddOptions(ownerId, mediaType, tmdbId, fourK === true) };
}
