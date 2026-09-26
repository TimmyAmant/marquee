import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { plexStartDto } from "@/lib/api/routes/media-auth";
import { startPlexWatchlist } from "@/lib/auth/media-signin";
import { getClientIp } from "@/lib/rate-limit";
import type { PlexSignInStart } from "@/lib/api/types";

/** Starts the plex.tv approval that turns the watchlist on — the same flow
 * as linking. `409` when the account has no Plex linked. */
export const POST = withApi(async (request): Promise<PlexSignInStart> => {
  const ctx = await requireApiUser(request);
  return plexStartDto(unwrap(await startPlexWatchlist(ctx.user.id, getClientIp(request))));
});
