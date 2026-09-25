import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { meDto } from "@/lib/api/me";
import { readJellyfinCredentials } from "@/lib/api/routes/media-auth";
import { linkJellyfin, unlinkAccount } from "@/lib/auth/media-signin";
import { getClientIp } from "@/lib/rate-limit";
import type { Me } from "@/lib/api/types";

/** Links a Jellyfin user to the signed-in account: `{ username, password }`,
 * checked against the admin's Jellyfin server. Answers the updated `Me`.
 * `401 invalid_credentials`, `409` when that Jellyfin user is linked to
 * another account, `429` under the Jellyfin sign-in limits. */
export const POST = withApi(async (request): Promise<Me> => {
  const ctx = await requireApiUser(request);
  const { username, password } = readJellyfinCredentials(await readJsonBody(request));
  unwrap(await linkJellyfin(ctx.user.id, username, password, getClientIp(request)));
  return meDto(ctx);
});

/** Unlinks it; `409` when it would leave the account with no way to sign in. */
export const DELETE = withApi(async (request): Promise<Me> => {
  const ctx = await requireApiUser(request);
  unwrap(await unlinkAccount(ctx.user.id, "jellyfin"));
  return meDto(ctx);
});
