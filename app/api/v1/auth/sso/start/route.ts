import { withApi } from "@/lib/api/handler";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { normalizeDeviceName } from "@/lib/api/tokens";
import { ssoStartDto } from "@/lib/api/routes/sso";
import { startAppSsoSignIn } from "@/lib/auth/sso/signin";
import { getClientIp } from "@/lib/rate-limit";
import type { SsoStart } from "@/lib/api/types";

/** Starts "Sign in with <SSO>" for an app: body `{ deviceName? }`. Open
 * `authUrl` in the browser (a page on this server that goes on to the
 * identity provider when the person continues), then poll POST
 * /auth/sso/poll with `handle`. Public and rate-limited per client address;
 * `409 conflict` when single sign-on isn't set up. */
export const POST = withApi(async (request): Promise<SsoStart> => {
  const body = await readJsonBody(request);
  const deviceName = typeof body.deviceName === "string" ? normalizeDeviceName(body.deviceName) : null;
  return ssoStartDto(unwrap(await startAppSsoSignIn(getClientIp(request), deviceName)));
});
