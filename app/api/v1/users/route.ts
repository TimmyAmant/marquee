import { withApi } from "@/lib/api/handler";
import { requireApiAdmin, requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { householdMember } from "@/lib/api/mappers";
import { readJsonBody } from "@/lib/api/request";
import { createHouseholdMember, getHouseholdMember, listHouseholdMembersFor } from "@/lib/users/household";
import { ApiError, apiJson } from "@/lib/api/errors";
import type { HouseholdMember, ListResponse } from "@/lib/api/types";

/** Settings → Account's member list: every account for the admin (oldest
 * first), only the caller's own account for a member. */
export const GET = withApi(async (request): Promise<ListResponse<HouseholdMember>> => {
  const ctx = await requireApiUser(request);
  const rows = await listHouseholdMembersFor({ userId: ctx.user.id, isAdmin: ctx.user.isAdmin });
  return { results: rows.map((row) => householdMember(row, ctx.user.id)) };
});

/** "Add a household member" (admin). Body: { username, password, displayName? }. */
export const POST = withApi(async (request): Promise<Response> => {
  const ctx = await requireApiAdmin(request, "Only the admin can add household members.");
  const body = await readJsonBody(request);

  const { userId } = unwrap(
    await createHouseholdMember({
      username: body.username,
      password: body.password,
      displayName: body.displayName || undefined,
    }),
  );

  const created = await getHouseholdMember(userId);
  if (!created) throw ApiError.of("internal", "Account was created but couldn't be read back.");
  return apiJson(householdMember(created, ctx.user.id), { status: 201 });
});
