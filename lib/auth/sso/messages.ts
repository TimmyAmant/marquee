// Why an SSO sign-in or link didn't work, as a short code the callback can
// put in a redirect (/login?sso=…, /settings?sso=…, /login/sso/done?result=…)
// and the page turns back into words. Only these fixed codes travel in the
// URL — never text from the identity provider — so nobody can craft a link
// that makes Marquee's own page say something it didn't. Client-safe.

export const SSO_ERROR_CODES = [
  "expired",
  "cancelled",
  "not_allowed",
  "no_account",
  "linked_elsewhere",
  "wrong_account",
  "not_configured",
  "rate_limited",
  "failed",
] as const;

export type SsoErrorCode = (typeof SSO_ERROR_CODES)[number];

export function parseSsoErrorCode(value: unknown): SsoErrorCode | null {
  return typeof value === "string" && (SSO_ERROR_CODES as readonly string[]).includes(value)
    ? (value as SsoErrorCode)
    : null;
}

/** `name` is the button's name ("Authentik"). */
export function ssoErrorMessage(code: SsoErrorCode, name: string): string {
  switch (code) {
    case "expired":
      return `That ${name} sign-in expired or was already used. Try again.`;
    case "cancelled":
      return `${name} sign-in was cancelled.`;
    case "not_allowed":
      return `Your ${name} account isn't allowed to use Marquee. Ask the admin to add you to the right group.`;
    case "no_account":
      return `There's no Marquee account for this ${name} account yet. Ask the admin to add you.`;
    case "linked_elsewhere":
      return `This ${name} account is already linked to another Marquee account.`;
    case "wrong_account":
      return `You're signed in to Marquee as someone else in this browser. Sign in as the account you're linking, then try again.`;
    case "not_configured":
      return `${name} sign-in isn't set up on this server anymore.`;
    case "rate_limited":
      return "Too many attempts. Try again in a few minutes.";
    case "failed":
      return `Couldn't finish signing in with ${name}. Try again, or ask the admin to check the server log.`;
  }
}
