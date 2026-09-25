import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { queryInt } from "@/lib/api/request";
import { notificationItem } from "@/lib/api/mappers";
import { getRecentNotifications, getUnreadCount } from "@/lib/notifications/query";
import type { ListResponse, NotificationItem } from "@/lib/api/types";

/** The notification bell's dropdown: most recent first (20 by default, like
 * the website), plus the unread count. */
export const GET = withApi(async (request): Promise<ListResponse<NotificationItem> & { unreadCount: number }> => {
  const ctx = await requireApiUser(request);
  const limit = queryInt(new URL(request.url), "limit", { min: 1, max: 100 }) ?? 20;

  const [rows, unreadCount] = await Promise.all([
    getRecentNotifications(ctx.user.id, limit),
    getUnreadCount(ctx.user.id),
  ]);

  return {
    unreadCount,
    results: rows.map(notificationItem),
  };
});
