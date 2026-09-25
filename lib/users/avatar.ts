import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userAvatars, users } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";
import type { Actor } from "@/lib/users/household";
import type { AvatarOwner } from "@/lib/users/avatar-path";
import { processAvatar } from "@/lib/users/avatar-image";

export { readAvatarUpload } from "@/lib/users/avatar-image";

// Profile photos, shared by the website's routes (/api/avatars/[id]) and
// /api/v1/users/{id}/avatar. A photo never leaves the server: it's stored in
// the database (userAvatars) and every client fetches it from here, the way
// they fetch artwork.

/** Same rule as editing an account: yourself, or anyone if you're the admin.
 * Seeing a photo follows it too, since members don't see who else lives in
 * the house (see listHouseholdMembersFor). */
export function canAccessAvatar(actor: Actor, userId: string): boolean {
  return actor.isAdmin || actor.userId === userId;
}

/** Replaces the account's photo. The caller has read the body; everything
 * from permission onward happens here. */
export async function setUserAvatar(
  actor: Actor,
  userId: string,
  upload: Uint8Array,
): Promise<CoreResult<{ owner: AvatarOwner }>> {
  if (!canAccessAvatar(actor, userId)) return fail("forbidden", "You can only change your own photo.");

  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return fail("not_found", "Account not found.");

  const processed = await processAvatar(upload);
  if (!processed.ok) return processed;

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(userAvatars)
      .values({ userId, image: processed.image, contentType: "image/jpeg", updatedAt: now })
      .onConflictDoUpdate({
        target: userAvatars.userId,
        set: { image: processed.image, contentType: "image/jpeg", updatedAt: now },
      });
    await tx.update(users).set({ avatarUpdatedAt: now }).where(eq(users.id, userId));
  });

  return { ok: true, owner: { id: userId, avatarUpdatedAt: now } };
}

/** Removes the account's photo, back to initials. Removing one that isn't
 * there is fine. */
export async function removeUserAvatar(actor: Actor, userId: string): Promise<CoreResult> {
  if (!canAccessAvatar(actor, userId)) return fail("forbidden", "You can only change your own photo.");

  await db.transaction(async (tx) => {
    await tx.delete(userAvatars).where(eq(userAvatars.userId, userId));
    await tx.update(users).set({ avatarUpdatedAt: null }).where(eq(users.id, userId));
  });
  return { ok: true };
}

/** The image response both routes serve. The ETag is the photo's version, so
 * a client revalidating an old URL gets a 304 until it changes; a URL that
 * carries the current version (`?v=`) is cached for good, since a new photo
 * always gets a new URL. Private: it's someone's face. */
export async function avatarResponse(actor: Actor, userId: string, request: Request): Promise<Response> {
  const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  // A photo you may not see answers exactly like one that doesn't exist.
  if (!canAccessAvatar(actor, userId)) return notFound();

  const [row] = await db.select().from(userAvatars).where(eq(userAvatars.userId, userId)).limit(1);
  if (!row) return notFound();

  const version = String(row.updatedAt.getTime());
  const etag = `"${version}"`;
  const pinned = new URL(request.url).searchParams.get("v") === version;
  const headers = {
    ETag: etag,
    "Cache-Control": pinned ? "private, max-age=31536000, immutable" : "private, no-cache",
    "X-Content-Type-Options": "nosniff",
  };

  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(row.image), {
    status: 200,
    headers: { ...headers, "Content-Type": row.contentType, "Content-Length": String(row.image.byteLength) },
  });
}
