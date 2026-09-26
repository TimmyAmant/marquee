import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { getUnreadCount } from "@/lib/notifications/query";
import { getFailedRequestCount, getPendingRequestCount } from "@/lib/requests/query";
import { getOpenIssueCount } from "@/lib/issues";
import { getNotFoundCount } from "@/lib/requests/not-found";
import { canReviewRequests } from "@/lib/users/roles";
import type { Badges } from "@/lib/api/types";

/** The header/nav counters in one cheap call — the notification bell's unread
 * count and, for the admin, the Requests badge (always 0 for members, as on
 * the website). Suited to polling. */
export const GET = withApi(async (request): Promise<Badges> => {
  const ctx = await requireApiUser(request);
  const reviews = canReviewRequests(ctx.user.role);
  const [unreadNotifications, pendingRequests, openIssues, notFoundRequests, failedRequests] = await Promise.all([
    getUnreadCount(ctx.user.id),
    reviews ? getPendingRequestCount() : Promise.resolve(0),
    reviews ? getOpenIssueCount() : Promise.resolve(0),
    reviews ? getNotFoundCount() : Promise.resolve(0),
    reviews ? getFailedRequestCount() : Promise.resolve(0),
  ]);
  return { unreadNotifications, pendingRequests, openIssues, notFoundRequests, failedRequests };
});
