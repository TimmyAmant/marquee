import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";
import { plexExpired, plexPending, readHandle } from "@/lib/api/routes/media-auth";
import { plexWatchlistDto } from "@/lib/api/routes/plex-watchlist";
import { pollPlexWatchlist } from "@/lib/auth/media-signin";
import { getClientIp } from "@/lib/rate-limit";

/** One poll of the watchlist approval. Body `{ handle }`. `202 {status:
 * "pending"}`, then `200` with the `PlexWatchlist`; `410 expired`; `403`
 * when a different Plex account approved it. */
export const POST = withApi(async (request): Promise<unknown> => {
  const ctx = await requireApiUser(request);
  const handle = readHandle(await readJsonBody(request));

  const poll = await pollPlexWatchlist(ctx.user.id, handle, getClientIp(request));
  if (poll.status === "pending") return plexPending();
  if (poll.status === "expired") throw plexExpired();
  if (!poll.ok) throw ApiError.fromFailure(poll);
  return plexWatchlistDto(ctx.user.id);
});
