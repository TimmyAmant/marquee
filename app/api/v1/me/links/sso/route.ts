import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { meDto } from "@/lib/api/me";
import { unlinkSso } from "@/lib/auth/sso/signin";
import type { Me } from "@/lib/api/types";

/** Unlinks the signed-in account's single sign-on; answers the updated
 * `Me`. `409` when it would leave the account with no way to sign in. */
export const DELETE = withApi(async (request): Promise<Me> => {
  const ctx = await requireApiUser(request);
  unwrap(await unlinkSso(ctx.user.id));
  return meDto(ctx);
});
