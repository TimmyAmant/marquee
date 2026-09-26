import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { shareableUser } from "@/lib/api/mappers";
import { getPublicBaseUrl, listShareableUsers } from "@/lib/sharing";
import type { ShareableUsersResponse } from "@/lib/api/types";

/** Who "Share → Send to a household member" can go to: every other account,
 * by name — for any member, not only the admin (GET /users lists a member
 * only their own account). Names and photos, nothing else. */
export const GET = withApi(async (request): Promise<ShareableUsersResponse> => {
  const ctx = await requireApiUser(request);
  const [rows, publicUrl] = await Promise.all([listShareableUsers(ctx.user.id), getPublicBaseUrl()]);
  return { results: rows.map(shareableUser), publicUrl };
});
