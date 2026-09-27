import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError, msg } from "@/lib/api/errors";
import { parseUuidSegment } from "@/lib/api/request";
import { checkRateLimit } from "@/lib/rate-limit";
import { canUseTraktSync, getTraktSync, syncTraktSync, SYNC_NOW_LIMIT, SYNC_NOW_WINDOW_MS } from "@/lib/trakt/sync";
import type { TraktSync } from "@/lib/api/types";

const NOT_FOUND = msg("server.traktSyncGone");

/** "Check now": reads the list now instead of at the next scheduled check,
 * and answers the updated sync. */
export const POST = withApi<{ id: string }>(async (request, params): Promise<TraktSync> => {
  const ctx = await requireApiUser(request);
  const id = parseUuidSegment(params.id, NOT_FOUND);
  if (!(await canUseTraktSync(ctx.user, id))) throw ApiError.of("not_found", NOT_FOUND);
  if (!checkRateLimit(`trakt-sync:check:${ctx.user.id}`, SYNC_NOW_LIMIT, SYNC_NOW_WINDOW_MS)) {
    throw ApiError.of("rate_limited", msg("server.checkedMomentAgo"));
  }
  const sync = await getTraktSync(id);
  if (!sync) throw ApiError.of("not_found", NOT_FOUND);
  await syncTraktSync(id, sync.owner.id);
  return (await getTraktSync(id)) ?? sync;
});
