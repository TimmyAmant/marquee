import { withApi } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";
import { authResponseFor, plexPending, readHandle } from "@/lib/api/routes/media-auth";
import { quickConnectExpired } from "@/lib/api/routes/sso";
import { pollQuickConnect } from "@/lib/auth/media-signin";
import { getClientIp } from "@/lib/rate-limit";

/** One poll of a Quick Connect sign-in. Body `{ handle, deviceName? }`.
 * `202 {status: "pending"}` until the code is approved; then `200` with the
 * same body as POST /auth/login, once. `410 expired`; `403` when that
 * Jellyfin user has no account here and new accounts are off — exactly
 * like POST /auth/jellyfin. */
export const POST = withApi(async (request): Promise<unknown> => {
  const body = await readJsonBody(request);
  const handle = readHandle(body);

  const poll = await pollQuickConnect(handle, getClientIp(request));
  if (poll.status === "pending") return plexPending();
  if (poll.status === "expired") throw quickConnectExpired();
  if (!poll.ok) throw ApiError.fromFailure(poll);
  return authResponseFor(poll.user, body.deviceName);
});
