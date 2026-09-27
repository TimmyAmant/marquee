import { withApi } from "@/lib/api/handler";
import { msg } from "@/lib/api/errors";
import { requireApiPermission } from "@/lib/api/auth";
import { iso, isoRequired, requestPerson, requestSeasons } from "@/lib/api/mappers";
import { getPendingRequests } from "@/lib/requests/query";
import { rejectionReasonPresets } from "@/lib/requests/rejection-reasons";
import { getT } from "@/lib/i18n/server";
import { getArrCredential } from "@/lib/integrations/credentials";
import { countComments } from "@/lib/comments";
import type { PendingRequestsResponse } from "@/lib/api/types";

/** The admin's review queue, newest first. Like the Requests page, this first
 * auto-approves (and notifies) any pending request whose title is already in
 * the library (for a season request: whose seasons all are, or are monitored). `sonarrUrl` is the admin's Sonarr base URL, for the "Add
 * manually in Sonarr" link. `rejectionReasons` is the preset list the web's
 * Reject chooser offers, so a native client shows the same choices and just
 * posts the chosen text to /requests/{id}/reject. */
export const GET = withApi(async (request): Promise<PendingRequestsResponse> => {
  const ctx = await requireApiPermission(request, "viewRequests", msg("server.onlyAdminReviewRequests"));
  const libraryOwnerId = await ctx.libraryOwnerId();

  const [pending, sonarrCred] = await Promise.all([
    getPendingRequests(libraryOwnerId),
    getArrCredential(libraryOwnerId, "sonarr"),
  ]);
  const comments = await countComments("request", pending.map((r) => r.id));
  const t = await getT();

  return {
    sonarrUrl: sonarrCred?.baseUrl ?? null,
    rejectionReasons: rejectionReasonPresets(t),
    results: pending.map((r) => ({
      id: r.id,
      mediaType: r.mediaType,
      tmdbId: r.tmdbId,
      title: r.title,
      posterPath: r.posterPath,
      ...requestSeasons(t, r.seasons),
      is4k: r.is4k,
      requestedBy: requestPerson({
        userId: r.requestedByUserId,
        displayName: r.requestedByName,
        username: r.requestedByUsername,
      }),
      createdAt: isoRequired(r.createdAt),
      editedAt: iso(r.editedAt),
      commentCount: comments.get(r.id) ?? 0,
      backdropPath: r.backdropPath ?? null,
    })),
  };
});
