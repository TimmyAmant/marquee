// Pure rules behind Plex/Jellyfin sign-in and import (lib/auth/media-signin.ts
// does the I/O): which Marquee account a verified media-server user becomes,
// and what username a new account gets. Kept free of the database so the
// security-relevant decisions are unit tested directly (media-accounts.test.ts).

export type MediaProvider = "plex" | "jellyfin";

export const MEDIA_PROVIDER_LABEL: Record<MediaProvider, string> = { plex: "Plex", jellyfin: "Jellyfin" };

export const NO_ACCOUNT_MESSAGE = "Ask the admin to add you first.";
export const PLEX_NO_ACCESS_MESSAGE = "This Plex account doesn't have access to this server.";

export type SignInDecision =
  | { action: "sign_in"; userId: string }
  | { action: "link_admin"; userId: string }
  | { action: "create" }
  | { action: "refuse"; message: string };

/**
 * Which account a verified Plex/Jellyfin user signs in as. In order:
 *  1. the account already linked to that Plex/Jellyfin user id;
 *  2. Plex only: the owner of the admin's server is the admin, so when the
 *     admin account has no Plex link yet it's linked now;
 *  3. a new member account when the admin allows it, otherwise refused.
 * Never by a matching username or email: those are chosen by whoever owns
 * the Plex/Jellyfin account, so matching on them would let anyone who can
 * sign in to the media server take over the Marquee account of the same
 * name (the admin's included).
 */
export function decideSignIn(input: {
  provider: MediaProvider;
  linkedUserId: string | null;
  /** Plex: this account owns one of the admin's servers. Always false for Jellyfin. */
  ownsServer: boolean;
  admin: { id: string; linked: boolean } | null;
  signupAllowed: boolean;
}): SignInDecision {
  if (input.linkedUserId) return { action: "sign_in", userId: input.linkedUserId };
  if (input.provider === "plex" && input.ownsServer && input.admin && !input.admin.linked) {
    return { action: "link_admin", userId: input.admin.id };
  }
  if (input.signupAllowed) return { action: "create" };
  return { action: "refuse", message: NO_ACCOUNT_MESSAGE };
}

/** Marquee's username rules (lib/users/household.ts): 3–32 characters of
 * letters, numbers, `_ . -`. */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;

/** Turns a Plex username / Jellyfin name into something that passes the
 * username rules: accents folded ("Zoë" → "Zoe"), spaces to dots, anything
 * else outside the allowed set dropped, cut to the maximum length. Too
 * little left over (an all-emoji name, say) falls back to "user". */
export function sanitizeUsername(raw: string): string {
  const folded = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, ".")
    .replace(/[^a-zA-Z0-9_.-]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.-]+|[.-]+$/g, "");
  const cut = folded.slice(0, USERNAME_MAX).replace(/[.-]+$/, "");
  return cut.length >= USERNAME_MIN ? cut : "user";
}

/**
 * `base` made unique among `taken` (compared case-insensitively, so "Anna"
 * and "anna" can't both exist and be confused at sign-in) by appending 2, 3,
 * … — trimming the base when the number would push it past the maximum
 * length.
 */
export function uniqueUsername(base: string, taken: ReadonlySet<string>): string {
  const lowerTaken = new Set([...taken].map((name) => name.toLowerCase()));
  if (!lowerTaken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const suffix = String(n);
    const candidate = `${base.slice(0, USERNAME_MAX - suffix.length)}${suffix}`;
    if (!lowerTaken.has(candidate.toLowerCase())) return candidate;
  }
}

/** A display name worth keeping: trimmed, at most 80 characters (the
 * household form's limit), null when there's nothing, or when it only
 * repeats the username. */
export function importedDisplayName(title: string | null | undefined, username: string): string | null {
  const name = (title ?? "").trim().slice(0, 80);
  if (!name || name === username) return null;
  return name;
}

/**
 * Whether unlinking `provider` would leave the account with no way in: no
 * password and no other linked media-server account. Refused, since
 * nobody could sign in to it afterwards (the admin would have to reset a
 * password for it).
 */
export function unlinkWouldLockOut(
  provider: MediaProvider,
  account: { hasPassword: boolean; plexLinked: boolean; jellyfinLinked: boolean },
): boolean {
  if (account.hasPassword) return false;
  return provider === "plex" ? !account.jellyfinLinked : !account.plexLinked;
}
