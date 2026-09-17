import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { INTEGRATIONS_FORBIDDEN } from "@/lib/api/routes/integrations";
import { startPlexAuthFor } from "@/lib/integrations/manage";
import type { PlexPinStart } from "@/lib/api/types";

/** Starts Plex sign-in: returns a plex.tv URL to open in the browser and a
 * PIN id to poll with GET ./pin/{pinId} until it reports connected. */
export const POST = withApi(async (request): Promise<PlexPinStart> => {
  const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
  const { authUrl, pinId } = unwrap(await startPlexAuthFor(ctx.user.id));
  return { authUrl, pinId };
});
