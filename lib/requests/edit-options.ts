import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requests } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";
import { canReviewRequests } from "@/lib/users/roles";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import type { TmdbTvDetails } from "@/lib/tmdb/client";
import { getSonarrSeasonStates } from "@/lib/integrations/status";
import { getLibraryOwnerUserId } from "@/lib/integrations/library-owner";
import { getAdminUserId } from "@/lib/auth/get-admin";
import { isFourKReady } from "@/lib/arr/fourk";
import { seasonsNewestFirst } from "@/lib/title-meta";
import { seasonPickerState, seasonRequestStates, summarizeViewerRequests } from "@/lib/requests/seasons";
import type { RequestActor } from "@/lib/requests/mutate";
import type { RequestEditOptions } from "@/lib/api/types";

/**
 * What "Edit" on a pending request can offer (GET /requests/{id}/edit-options):
 * the show's seasons as the season picker lists them — this request's own
 * seasons pickable and ticked, ones already in the library, monitored or
 * asked for in another of the requester's requests not — and whether 4K is
 * an option. The same people who may edit it may see this.
 */
export async function getRequestEditOptions(
  actor: RequestActor,
  requestId: string,
): Promise<CoreResult<{ options: RequestEditOptions }>> {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
  if (!request || (request.requestedByUserId !== actor.userId && !canReviewRequests(actor.role))) {
    return fail("not_found", "Request not found.");
  }
  if (request.status !== "pending") {
    return fail("conflict", "It's already been reviewed, so it can't be changed. Ask in its comments instead.");
  }

  const adminUserId = await getAdminUserId();
  const fourKAvailable = request.is4k || (adminUserId ? await isFourKReady(adminUserId, request.mediaType).catch(() => false) : false);

  let seasonRows: RequestEditOptions["seasonRows"] = [];
  if (request.mediaType === "tv") {
    const title = await getOrFetchTitle("tv", request.tmdbId).catch(() => null);
    if (!title) return fail("upstream", "Couldn't check this show's seasons with TMDb right now.");
    const seasons = seasonsNewestFirst((title.rawTmdb as TmdbTvDetails | null)?.seasons ?? []);
    const libraryOwnerId = await getLibraryOwnerUserId(request.requestedByUserId);
    const [library, others] = await Promise.all([
      getSonarrSeasonStates(libraryOwnerId, title.tvdbId).catch(() => null),
      db
        .select({ status: requests.status, seasons: requests.seasons })
        .from(requests)
        .where(
          and(
            eq(requests.requestedByUserId, request.requestedByUserId),
            eq(requests.mediaType, "tv"),
            eq(requests.tmdbId, request.tmdbId),
            eq(requests.is4k, false),
            eq(requests.status, "approved"),
            ne(requests.id, request.id),
          ),
        ),
    ]);
    const numbers = seasons.map((s) => s.season_number);
    const summary = summarizeViewerRequests(
      others.map((r) => ({ status: "approved" as const, seasons: r.seasons })),
      numbers,
      library !== null,
    );
    const states = seasonRequestStates({ seasonNumbers: numbers, library, requested: summary.requested, isMember: true });
    const own = new Set(request.seasons ?? []);
    seasonRows = seasons.map((season) => {
      const state = seasonPickerState(states.get(season.season_number));
      return {
        seasonNumber: season.season_number,
        name: season.name,
        episodeCount: season.episode_count,
        // Its own seasons stay pickable even once Sonarr has them monitored:
        // they're what's being changed.
        state: own.has(season.season_number) && state !== "complete" ? "requestable" : state,
      };
    });
  }

  return {
    ok: true,
    options: {
      requestId: request.id,
      mediaType: request.mediaType,
      title: request.title,
      seasons: request.seasons,
      is4k: request.is4k,
      seasonRows,
      fourKAvailable,
    },
  };
}
