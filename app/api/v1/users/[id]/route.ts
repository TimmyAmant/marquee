import { withApi } from "@/lib/api/handler";
import { requireApiAdmin, requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { ApiError } from "@/lib/api/errors";
import { householdMember } from "@/lib/api/mappers";
import { optionalBoolean, optionalString, parseUuidSegment, readJsonBody } from "@/lib/api/request";
import { deleteHouseholdMember, getHouseholdMember, updateHouseholdMember } from "@/lib/users/household";
import type { Ok, UpdateUserResponse } from "@/lib/api/types";

/**
 * Edit an account — your own, or (admin) anyone's. Same fields and rules as
 * the website's edit form: `username` is required; `displayName` and
 * `password` are optional (omitted/empty = unchanged); `autoApproveMovies` /
 * `autoApproveTv` are honored only for the admin (omitted = unchanged).
 * Setting a new password on your own account also needs `currentPassword`
 * (400 `invalid` when it's missing or wrong); the admin resetting someone
 * else's password doesn't.
 * Setting a password revokes every API token of that account, including the
 * caller's own when editing yourself — sign in again afterwards.
 */
export const PATCH = withApi<{ id: string }>(async (request, params): Promise<UpdateUserResponse> => {
  const ctx = await requireApiUser(request);
  const userId = parseUuidSegment(params.id, "Account not found.");
  const body = await readJsonBody(request);

  if (!ctx.user.isAdmin && userId !== ctx.user.id) {
    throw ApiError.of("forbidden", "You can only edit your own account.");
  }
  if (!(await getHouseholdMember(userId))) throw ApiError.of("not_found", "Account not found.");

  const { passwordChanged } = unwrap(
    await updateHouseholdMember(
      { userId: ctx.user.id, isAdmin: ctx.user.isAdmin },
      {
        userId,
        username: body.username,
        password: optionalString(body, "password") || undefined,
        currentPassword: optionalString(body, "currentPassword") || undefined,
        displayName: optionalString(body, "displayName") || undefined,
        autoApproveMovies: optionalBoolean(body, "autoApproveMovies"),
        autoApproveTv: optionalBoolean(body, "autoApproveTv"),
      },
    ),
  );

  const updated = await getHouseholdMember(userId);
  if (!updated) throw ApiError.of("not_found", "Account not found.");
  return { ok: true, user: householdMember(updated, ctx.user.id), tokensRevoked: passwordChanged };
});

/** Remove a member's account (admin). Can't remove yourself or the admin. */
export const DELETE = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiAdmin(request, "Only the admin can remove household members.");
  const userId = parseUuidSegment(params.id, "Account not found.");
  unwrap(await deleteHouseholdMember(ctx.user.id, userId));
  return { ok: true };
});
