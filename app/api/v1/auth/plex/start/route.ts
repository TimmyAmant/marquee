import { withApi } from "@/lib/api/handler";
import { unwrap } from "@/lib/api/guards";
import { plexStartDto } from "@/lib/api/routes/media-auth";
import { startPlexSignIn } from "@/lib/auth/media-signin";
import { getClientIp } from "@/lib/rate-limit";
import type { PlexSignInStart } from "@/lib/api/types";

/** Starts "Sign in with Plex": a plex.tv URL for the browser, and a handle
 * to poll POST /auth/plex/poll with. Public and rate-limited per client
 * address. `409 conflict` when Plex isn't connected on this server. */
export const POST = withApi(async (request): Promise<PlexSignInStart> => {
  return plexStartDto(unwrap(await startPlexSignIn(getClientIp(request))));
});
