// Why an SSO sign-in or link didn't work, as a short code the callback can
// put in a redirect (/login?sso=…, /settings?sso=…, /login/sso/done?result=…)
// and the page turns back into words. Only these fixed codes travel in the
// URL — never text from the identity provider — so nobody can craft a link
// that makes Marquee's own page say something it didn't. Server-side: the
// words come from lib/i18n's message files.

import { englishT } from "@/lib/i18n/catalog";
import type { MessageKey, Translator } from "@/lib/i18n/translator";

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

const MESSAGE_KEYS: Record<SsoErrorCode, MessageKey> = {
  expired: "auth.ssoExpired",
  cancelled: "auth.ssoCancelled",
  not_allowed: "auth.ssoNotAllowed",
  no_account: "auth.ssoNoAccount",
  linked_elsewhere: "auth.ssoLinkedElsewhere",
  wrong_account: "auth.ssoWrongAccount",
  not_configured: "auth.ssoNotConfigured",
  rate_limited: "auth.tooManyAttempts",
  failed: "auth.ssoFailed",
};

/** `name` is the button's name ("Authentik"); without one, "single sign-on"
 * in the reader's language. `t` is the reader's language — English when
 * left out (the API's error bodies). */
export function ssoErrorMessage(
  code: SsoErrorCode,
  name: string | null | undefined,
  t: Translator = englishT(),
): string {
  return t(MESSAGE_KEYS[code], { name: name || t("auth.singleSignOn") });
}
