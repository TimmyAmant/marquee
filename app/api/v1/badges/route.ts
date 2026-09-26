import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { getUnreadCount } from "@/lib/notifications/query";
import { attentionCounts } from "@/lib/requests/access";
import type { Badges } from "@/lib/api/types";

/** The header/nav counters in one cheap call — the notification bell's unread
 * count and the Requests badge's parts, each 0 unless this account may act on
 * it (lib/requests/access.ts), as on the website. Suited to polling. */
export const GET = withApi(async (request): Promise<Badges> => {
  const ctx = await requireApiUser(request);
  const [unreadNotifications, counts] = await Promise.all([getUnreadCount(ctx.user.id), attentionCounts(ctx.user)]);
  return { unreadNotifications, ...counts };
});
