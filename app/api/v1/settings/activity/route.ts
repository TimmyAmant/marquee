import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { isoRequired, requestPerson } from "@/lib/api/mappers";
import { getRecentActivity } from "@/lib/activity/query";
import { ACTIVITY_EVENT_VERBS } from "@/lib/pages/settings";
import type { ActivityItem, ListResponse } from "@/lib/api/types";

/** Settings → Activity (admin): the 50 most recent request events — who
 * requested, approved or declined what. */
export const GET = withApi(async (request): Promise<ListResponse<ActivityItem>> => {
  await requireApiAdmin(request);
  const events = await getRecentActivity();
  return {
    results: events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      verb: ACTIVITY_EVENT_VERBS[event.eventType],
      mediaType: event.mediaType,
      tmdbId: event.tmdbId,
      title: event.title,
      actor: requestPerson({ displayName: event.actorName, username: event.actorUsername }),
      createdAt: isoRequired(event.createdAt),
    })),
  };
});
