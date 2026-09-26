import { withApi } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";
import { authResponseFor, plexPending, readHandle } from "@/lib/api/routes/media-auth";
import { ssoExpired } from "@/lib/api/routes/sso";
import { pollAppSsoSignIn } from "@/lib/auth/sso/signin";
import { getClientIp } from "@/lib/rate-limit";

/** One poll of an app's SSO sign-in. Body `{ handle, deviceName? }`. `202
 * {status: "pending"}` until the browser side is done; then `200` with the
 * same body as POST /auth/login, once — the handle is used up. `410
 * expired` for an unknown, used or timed-out handle; `403 forbidden` when
 * the identity provider's account may not use Marquee here (not in the
 * required group, or no account and new accounts are off). */
export const POST = withApi(async (request): Promise<unknown> => {
  const body = await readJsonBody(request);
  const handle = readHandle(body);

  const poll = await pollAppSsoSignIn(handle, getClientIp(request));
  if (poll.status === "pending") return plexPending();
  if (poll.status === "expired") throw ssoExpired();
  if (!poll.ok) throw ApiError.fromFailure(poll);
  return authResponseFor(poll.user, body.deviceName ?? poll.deviceName);
});
