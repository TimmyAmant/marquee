import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { markAllNotificationsRead } from "@/lib/notifications/query";
import type { Ok } from "@/lib/api/types";

/** "Mark all read". */
export const POST = withApi(async (request): Promise<Ok> => {
  const ctx = await requireApiUser(request);
  await markAllNotificationsRead(ctx.user.id);
  return { ok: true };
});
