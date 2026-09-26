import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { plexWatchlistDto } from "@/lib/api/routes/plex-watchlist";
import { syncPlexWatchlist, SYNC_NOW_LIMIT, SYNC_NOW_WINDOW_MS } from "@/lib/plex/watchlist";
import { checkRateLimit } from "@/lib/rate-limit";
import type { PlexWatchlist } from "@/lib/api/types";

/** Reads the watchlist now instead of at the next scheduled check, and
 * answers the updated state. */
export const POST = withApi(async (request): Promise<PlexWatchlist> => {
  const ctx = await requireApiUser(request);
  if (!checkRateLimit(`plex-watchlist:sync:${ctx.user.id}`, SYNC_NOW_LIMIT, SYNC_NOW_WINDOW_MS)) {
    throw ApiError.of("rate_limited", "Checked a moment ago. Try again in a minute.");
  }
  await syncPlexWatchlist(ctx.user.id);
  return plexWatchlistDto(ctx.user.id);
});
