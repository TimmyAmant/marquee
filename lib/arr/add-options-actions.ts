"use server";

import { auth } from "@/auth";
import type { MediaType } from "@/lib/db/schema";
import { can } from "@/lib/users/permissions";
import { getAdminUserId } from "@/lib/auth/get-admin";
import { getAddOptions, requesterForOptions, type AddOptions } from "@/lib/arr/add-options-server";
import { getT } from "@/lib/i18n/server";

/** The website's "Advanced" section under Approve (and the admin's Add):
 * the servers a title could go to, with their pickers and defaults. For
 * whoever may use Advanced request options — always the admin's servers.
 * `context`: a request being reviewed (`requestId`), or one the viewer is
 * making (`forRequest`), so the override rule that applies is the default. */
export async function getAddOptionsAction(
  mediaType: MediaType,
  tmdbId: number,
  fourK: boolean,
  context?: { requestId?: string; forRequest?: boolean },
): Promise<{ ok: true; options: AddOptions } | { ok: false; error: string }> {
  const session = await auth();
  const t = await getT();
  if (!session?.user || !can(session.user, "advancedRequests")) {
    return { ok: false, error: t("notify.advancedOptionsNotAllowed") };
  }
  if ((mediaType !== "movie" && mediaType !== "tv") || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return { ok: false, error: t("notify.titleNotFound") };
  }
  const ownerId = session.user.role === "admin" ? session.user.id : await getAdminUserId();
  if (!ownerId) return { ok: false, error: t("notify.noAdminToAdd") };
  const forRequest = await requesterForOptions(session.user, context);
  return { ok: true, options: await getAddOptions(ownerId, mediaType, tmdbId, fourK === true, forRequest) };
}
