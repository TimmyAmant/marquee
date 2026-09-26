import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { getPendingRequestCount } from "@/lib/requests/query";
import { can } from "@/lib/users/permissions";

/** The nav's Requests badge. Always 0 for members, exactly as the website's
 * badge action behaves. */
export const GET = withApi(async (request): Promise<{ count: number }> => {
  const ctx = await requireApiUser(request);
  return { count: can(ctx.user, "reviewRequests") ? await getPendingRequestCount() : 0 };
});
