import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { syncNowForUser } from "@/lib/integrations/manage";
import type { Ok } from "@/lib/api/types";

/** "Sync now": immediately re-syncs every integration the caller has
 * connected (for a member, that's usually none — the same as the web action,
 * which only requires being signed in). 502 if any of them failed. */
export const POST = withApi(async (request): Promise<Ok> => {
  const ctx = await requireApiUser(request);
  unwrap(await syncNowForUser(ctx.user.id));
  return { ok: true };
});
