import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { parseUuidSegment } from "@/lib/api/request";
import { avatarResponse, readAvatarUpload, removeUserAvatar, setUserAvatar } from "@/lib/users/avatar";
import { avatarPath } from "@/lib/users/avatar-path";
import type { AvatarResponse } from "@/lib/api/types";

/**
 * An account's profile photo: yours, or (admin) anyone's. GET answers with
 * the image itself (a 512px square JPEG), 404 when there's none or it isn't
 * yours to see. `avatarUrl` on /me, the login response and household
 * members points here with a `?v=` version, and under that URL the image is
 * cacheable for good.
 */
export const GET = withApi<{ id: string }>(async (request, params) => {
  const ctx = await requireApiUser(request);
  const userId = parseUuidSegment(params.id, "Account not found.");
  return avatarResponse({ userId: ctx.user.id, isAdmin: ctx.user.isAdmin }, userId, request);
});

/** Replace the photo. The body is the image file itself (JPEG, PNG, WebP,
 * GIF or AVIF, at most 15 MB); the server crops and re-encodes it. HEIC
 * isn't read here, so convert it on the device first. */
export const PUT = withApi<{ id: string }>(async (request, params): Promise<AvatarResponse> => {
  const ctx = await requireApiUser(request);
  const userId = parseUuidSegment(params.id, "Account not found.");
  const upload = unwrap(await readAvatarUpload(request));
  const { owner } = unwrap(await setUserAvatar({ userId: ctx.user.id, isAdmin: ctx.user.isAdmin }, userId, upload.bytes));
  return { ok: true, avatarUrl: avatarPath(owner, "/api/v1") };
});

/** Remove the photo, back to initials. */
export const DELETE = withApi<{ id: string }>(async (request, params): Promise<AvatarResponse> => {
  const ctx = await requireApiUser(request);
  const userId = parseUuidSegment(params.id, "Account not found.");
  unwrap(await removeUserAvatar({ userId: ctx.user.id, isAdmin: ctx.user.isAdmin }, userId));
  return { ok: true, avatarUrl: null };
});
