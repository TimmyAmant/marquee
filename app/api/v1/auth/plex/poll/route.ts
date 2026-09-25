import { withApi } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";
import { authResponseFor, plexExpired, plexPending, readHandle } from "@/lib/api/routes/media-auth";
import { pollPlexSignIn } from "@/lib/auth/media-signin";
import { getClientIp } from "@/lib/rate-limit";

/** One poll of a Plex sign-in. Body `{ handle, deviceName? }`. `202
 * {status: "pending"}` until the person approves on plex.tv; then `200`
 * with the same body as POST /auth/login, once — the handle is used up.
 * `410 expired` for an unknown, used or timed-out handle; `403 forbidden`
 * when that Plex account can't use this server, or has no account here and
 * new accounts are off. */
export const POST = withApi(async (request): Promise<unknown> => {
  const body = await readJsonBody(request);
  const handle = readHandle(body);

  const poll = await pollPlexSignIn(handle, getClientIp(request));
  if (poll.status === "pending") return plexPending();
  if (poll.status === "expired") throw plexExpired();
  if (!poll.ok) throw ApiError.fromFailure(poll);
  return authResponseFor(poll.user, body.deviceName);
});
