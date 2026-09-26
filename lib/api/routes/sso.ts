import { ApiError } from "@/lib/api/errors";
import { webhookBaseUrl } from "@/lib/integrations/webhook-urls";
import { callbackUrlFor, DEFAULT_GROUPS_CLAIM, DEFAULT_SSO_SCOPES, type SsoSettingsView } from "@/lib/auth/sso/config";
import type { QuickConnectStart, SsoSettings, SsoStart } from "@/lib/api/types";

// Shared pieces of the single sign-on and Quick Connect endpoints
// (lib/auth/sso, lib/auth/media-signin.ts does the work).

export function ssoStartDto(start: { handle: string; authUrl: string; expiresAt: Date }): SsoStart {
  return { handle: start.handle, authUrl: start.authUrl, expiresAt: start.expiresAt.toISOString() };
}

export function quickConnectStartDto(start: { handle: string; code: string; expiresAt: Date }): QuickConnectStart {
  return { handle: start.handle, code: start.code, expiresAt: start.expiresAt.toISOString() };
}

export function ssoExpired(): ApiError {
  return ApiError.of("expired", "That sign-in expired. Try again.");
}

export function quickConnectExpired(): ApiError {
  return ApiError.of("expired", "That Quick Connect code expired. Try again.");
}

/** GET /settings/sso: the saved settings without the secret, or — before
 * SSO is set up — the defaults, with this request's address as Marquee's. */
export function ssoSettingsDto(view: SsoSettingsView | null, request: Request): SsoSettings {
  if (view) {
    const { name, issuer, clientId, hasClientSecret, scopes, publicUrl, callbackUrl } = view;
    const { allowSignup, matchEmail, requiredGroup, trustedGroup, groupsClaim } = view;
    return {
      configured: true,
      name,
      issuer,
      clientId,
      hasClientSecret,
      scopes,
      publicUrl,
      callbackUrl,
      allowSignup,
      matchEmail,
      requiredGroup,
      trustedGroup,
      groupsClaim,
    };
  }
  const publicUrl = webhookBaseUrl(request.headers);
  return {
    configured: false,
    name: "",
    issuer: "",
    clientId: "",
    hasClientSecret: false,
    scopes: DEFAULT_SSO_SCOPES,
    publicUrl,
    callbackUrl: callbackUrlFor(publicUrl),
    allowSignup: false,
    matchEmail: false,
    requiredGroup: null,
    trustedGroup: null,
    groupsClaim: DEFAULT_GROUPS_CLAIM,
  };
}
