// Pure (no database or image imports) so API mappers and their tests can
// build photo URLs; the photos themselves live in lib/users/avatar.ts.

/** The user row fields the avatar URL is built from. */
export type AvatarOwner = { id: string; avatarUpdatedAt: Date | null };

/** Where a client fetches this account's photo, or null when there's none.
 * The `v` parameter changes whenever the photo does, so the response can be
 * cached for good under that URL. `base` is "/api/v1" for native clients
 * and "/api" for the website, whose route reads the browser session. */
export function avatarPath(owner: AvatarOwner, base: "/api" | "/api/v1"): string | null {
  if (!owner.avatarUpdatedAt) return null;
  const segment = base === "/api/v1" ? `users/${owner.id}/avatar` : `avatars/${owner.id}`;
  return `${base}/${segment}?v=${owner.avatarUpdatedAt.getTime()}`;
}
