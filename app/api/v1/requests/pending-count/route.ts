import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { getPendingRequestCount } from "@/lib/requests/query";
import { canReviewRequests } from "@/lib/users/roles";

/** The nav's Requests badge. Always 0 for members, exactly as the website's
 * badge action behaves. */
export const GET = withApi(async (request): Promise<{ count: number }> => {
  const ctx = await requireApiUser(request);
  return { count: canReviewRequests(ctx.user.role) ? await getPendingRequestCount() : 0 };
});
