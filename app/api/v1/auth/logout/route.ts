import { withApi } from "@/lib/api/handler";
import { ApiError, msg } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/api/auth";
import { revokeApiToken } from "@/lib/api/token-store";
import type { Ok } from "@/lib/api/types";

/** Revokes the calling token. */
export const POST = withApi(async (request): Promise<Ok> => {
  const ctx = await requireApiUser(request);
  // An API key is revoked under Settings › General, not signed out
  // (the key policy refuses /auth with a key before this runs anyway).
  if (!ctx.tokenId) throw ApiError.of("forbidden", msg("server.apiKeysCantSignOut"));
  await revokeApiToken(ctx.tokenId, ctx.user.id);
  return { ok: true };
});
