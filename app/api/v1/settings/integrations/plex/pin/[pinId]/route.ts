import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { parseIdSegment } from "@/lib/api/request";
import { INTEGRATIONS_FORBIDDEN } from "@/lib/api/routes/integrations";
import { checkPlexAuthFor } from "@/lib/integrations/manage";
import type { PlexPinStatus } from "@/lib/api/types";

/** One poll of a Plex PIN sign-in. `connected: false` until the user finishes
 * on plex.tv; the first `connected: true` saves the token and runs an initial
 * library sync before answering (so it can take a while). The website polls
 * every 2.5 s and gives up after 2 minutes. */
export const GET = withApi<{ pinId: string }>(async (request, params): Promise<PlexPinStatus> => {
  const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
  const pinId = parseIdSegment(params.pinId, "PIN id");
  const status = await checkPlexAuthFor(ctx.user.id, pinId);
  return {
    connected: status.connected,
    movieCount: status.movieCount ?? null,
    tvCount: status.tvCount ?? null,
  };
});
