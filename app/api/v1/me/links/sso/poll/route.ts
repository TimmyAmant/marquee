import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";
import { meDto } from "@/lib/api/me";
import { plexPending, readHandle } from "@/lib/api/routes/media-auth";
import { ssoExpired } from "@/lib/api/routes/sso";
import { pollAppSsoLink } from "@/lib/auth/sso/signin";
import { getClientIp } from "@/lib/rate-limit";

/** One poll of an SSO link. Body `{ handle }`. `202 {status: "pending"}`,
 * then `200` with the updated `Me`; `410 expired`; `403` when that identity
 * may not use Marquee (required group); `409` when it's linked to another
 * account. */
export const POST = withApi(async (request): Promise<unknown> => {
  const ctx = await requireApiUser(request);
  const handle = readHandle(await readJsonBody(request));

  const poll = await pollAppSsoLink(ctx.user.id, handle, getClientIp(request));
  if (poll.status === "pending") return plexPending();
  if (poll.status === "expired") throw ssoExpired();
  if (!poll.ok) throw ApiError.fromFailure(poll);
  return meDto(ctx);
});
