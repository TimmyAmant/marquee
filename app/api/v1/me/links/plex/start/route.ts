import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { plexStartDto } from "@/lib/api/routes/media-auth";
import { startPlexLink } from "@/lib/auth/media-signin";
import { getClientIp } from "@/lib/rate-limit";
import type { PlexSignInStart } from "@/lib/api/types";

/** Starts linking a Plex account to the signed-in account — the same
 * plex.tv flow as sign-in, with a handle only this account can poll. */
export const POST = withApi(async (request): Promise<PlexSignInStart> => {
  const ctx = await requireApiUser(request);
  return plexStartDto(unwrap(await startPlexLink(ctx.user.id, getClientIp(request))));
});
