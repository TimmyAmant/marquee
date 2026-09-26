import { withApi } from "@/lib/api/handler";
import { requireApiAdmin, requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { ApiError, msg } from "@/lib/api/errors";
import { householdMember } from "@/lib/api/mappers";
import { optionalBoolean, optionalString, parseUuidSegment, readJsonBody } from "@/lib/api/request";
import { deleteHouseholdMember, getHouseholdMember, updateHouseholdMember } from "@/lib/users/household";
import type { Ok, UpdateUserResponse } from "@/lib/api/types";

/**
 * Edit an account — your own, or (admin) anyone's. Same fields and rules as
 * the website's edit form: `username` is required; `displayName` and
 * `password` are optional (omitted/empty = unchanged); `autoApproveMovies` /
 * `autoApproveTv` are honored only for the admin (omitted = unchanged).
 * `permissions` (0.48+, the admin, on someone else's account): switches to
 * change, e.g. `{ "requestTv": false, "viewRequests": true }` — others stay
 * as they are; anyone else sending it gets 403. `role` "member" / "trusted"
 * fills in that preset's switches when it's a change.
 * Setting a new password on your own account also needs `currentPassword`
 * (400 `invalid` when it's missing or wrong); the admin resetting someone
 * else's password doesn't.
 * Setting a password revokes every API token of that account, including the
 * caller's own when editing yourself — sign in again afterwards.
 */
export const PATCH = withApi<{ id: string }>(async (request, params): Promise<UpdateUserResponse> => {
  const ctx = await requireApiUser(request);
  const userId = parseUuidSegment(params.id, msg("server.accountNotFound"));
  const body = await readJsonBody(request);

  if (!ctx.user.isAdmin && userId !== ctx.user.id) {
    throw ApiError.of("forbidden", msg("server.onlyEditOwnAccount"));
  }
  if (!(await getHouseholdMember(userId))) throw ApiError.of("not_found", msg("server.accountNotFound"));

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
        // 0.39+, admin only: omitted = unchanged; a limit of null removes it.
        role: body.role,
        movieQuotaLimit: body.movieQuotaLimit,
        movieQuotaDays: body.movieQuotaDays,
        tvQuotaLimit: body.tvQuotaLimit,
        tvQuotaDays: body.tvQuotaDays,
        // 0.48+, admin only (lib/users/permissions.ts).
        permissions: body.permissions,
      },
    ),
  );

  const updated = await getHouseholdMember(userId);
  if (!updated) throw ApiError.of("not_found", msg("server.accountNotFound"));
  return { ok: true, user: householdMember(updated, ctx.user.id), tokensRevoked: passwordChanged };
});

/** Remove a member's account (admin). Can't remove yourself or the admin. */
export const DELETE = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiAdmin(request, msg("server.onlyAdminRemoveMembers"));
  const userId = parseUuidSegment(params.id, msg("server.accountNotFound"));
  unwrap(await deleteHouseholdMember(ctx.user.id, userId));
  return { ok: true };
});
