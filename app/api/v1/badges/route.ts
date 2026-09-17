import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { getUnreadCount } from "@/lib/notifications/query";
import { getPendingRequestCount } from "@/lib/requests/query";
import type { Badges } from "@/lib/api/types";

/** The header/nav counters in one cheap call — the notification bell's unread
 * count and, for the admin, the Requests badge (always 0 for members, as on
 * the website). Suited to polling. */
export const GET = withApi(async (request): Promise<Badges> => {
  const ctx = await requireApiUser(request);
  const [unreadNotifications, pendingRequests] = await Promise.all([
    getUnreadCount(ctx.user.id),
    ctx.user.isAdmin ? getPendingRequestCount() : Promise.resolve(0),
  ]);
  return { unreadNotifications, pendingRequests };
});
