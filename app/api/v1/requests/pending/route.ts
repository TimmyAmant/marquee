import { withApi } from "@/lib/api/handler";
import { requireApiReviewer } from "@/lib/api/auth";
import { iso, isoRequired, requestPerson, requestSeasons } from "@/lib/api/mappers";
import { getPendingRequests } from "@/lib/requests/query";
import { REJECTION_REASON_PRESETS } from "@/lib/requests/rejection-reasons";
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
  const ctx = await requireApiReviewer(request, "Only an admin can review requests.");
  const libraryOwnerId = await ctx.libraryOwnerId();

  const [pending, sonarrCred] = await Promise.all([
    getPendingRequests(libraryOwnerId),
    getArrCredential(libraryOwnerId, "sonarr"),
  ]);
  const comments = await countComments("request", pending.map((r) => r.id));

  return {
    sonarrUrl: sonarrCred?.baseUrl ?? null,
    rejectionReasons: [...REJECTION_REASON_PRESETS],
    results: pending.map((r) => ({
      id: r.id,
      mediaType: r.mediaType,
      tmdbId: r.tmdbId,
      title: r.title,
      posterPath: r.posterPath,
      ...requestSeasons(r.seasons),
      is4k: r.is4k,
      requestedBy: requestPerson({
        userId: r.requestedByUserId,
        displayName: r.requestedByName,
        username: r.requestedByUsername,
      }),
      createdAt: isoRequired(r.createdAt),
      editedAt: iso(r.editedAt),
      commentCount: comments.get(r.id) ?? 0,
    })),
  };
});
