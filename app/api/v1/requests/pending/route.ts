import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { isoRequired, requestPerson } from "@/lib/api/mappers";
import { getPendingRequests } from "@/lib/requests/query";
import { getArrCredential } from "@/lib/integrations/credentials";
import type { PendingRequestsResponse } from "@/lib/api/types";

/** The admin's review queue, newest first. Like the Requests page, this first
 * auto-approves (and notifies) any pending request whose title is already in
 * the library. `sonarrUrl` is the admin's Sonarr base URL, for the "Add
 * manually in Sonarr" link. */
export const GET = withApi(async (request): Promise<PendingRequestsResponse> => {
  const ctx = await requireApiAdmin(request, "Only an admin can review requests.");
  const libraryOwnerId = await ctx.libraryOwnerId();

  const [pending, sonarrCred] = await Promise.all([
    getPendingRequests(libraryOwnerId),
    getArrCredential(libraryOwnerId, "sonarr"),
  ]);

  return {
    sonarrUrl: sonarrCred?.baseUrl ?? null,
    results: pending.map((r) => ({
      id: r.id,
      mediaType: r.mediaType,
      tmdbId: r.tmdbId,
      title: r.title,
      posterPath: r.posterPath,
      requestedBy: requestPerson({
        userId: r.requestedByUserId,
        displayName: r.requestedByName,
        username: r.requestedByUsername,
      }),
      createdAt: isoRequired(r.createdAt),
    })),
  };
});
