import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { revokeApiToken } from "@/lib/api/token-store";
import type { Ok } from "@/lib/api/types";

/** Revokes the calling token. */
export const POST = withApi(async (request): Promise<Ok> => {
  const ctx = await requireApiUser(request);
  await revokeApiToken(ctx.tokenId, ctx.user.id);
  return { ok: true };
});
