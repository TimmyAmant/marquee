import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";
import { meDto } from "@/lib/api/me";
import { plexExpired, plexPending, readHandle } from "@/lib/api/routes/media-auth";
import { pollPlexLink } from "@/lib/auth/media-signin";
import { getClientIp } from "@/lib/rate-limit";

/** One poll of a Plex link. Body `{ handle }`. `202 {status: "pending"}`,
 * then `200` with the updated `Me`; `410 expired`; `403` when that Plex
 * account can't use this server; `409` when it's linked to another account. */
export const POST = withApi(async (request): Promise<unknown> => {
  const ctx = await requireApiUser(request);
  const handle = readHandle(await readJsonBody(request));

  const poll = await pollPlexLink(ctx.user.id, handle, getClientIp(request));
  if (poll.status === "pending") return plexPending();
  if (poll.status === "expired") throw plexExpired();
  if (!poll.ok) throw ApiError.fromFailure(poll);
  return meDto(ctx);
});
