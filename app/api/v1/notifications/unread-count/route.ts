import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { getUnreadCount } from "@/lib/notifications/query";

/** The bell's badge count (the website polls this every 30 seconds). */
export const GET = withApi(async (request): Promise<{ count: number }> => {
  const ctx = await requireApiUser(request);
  return { count: await getUnreadCount(ctx.user.id) };
});
