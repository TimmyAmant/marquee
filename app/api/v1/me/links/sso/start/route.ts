import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { ssoStartDto } from "@/lib/api/routes/sso";
import { startAppSsoLink } from "@/lib/auth/sso/signin";
import { getClientIp } from "@/lib/rate-limit";
import type { SsoStart } from "@/lib/api/types";

/** Starts linking single sign-on to the signed-in account — the same browser
 * flow as sign-in, with a handle only this account can poll. */
export const POST = withApi(async (request): Promise<SsoStart> => {
  const ctx = await requireApiUser(request);
  return ssoStartDto(unwrap(await startAppSsoLink(ctx.user, getClientIp(request))));
});
