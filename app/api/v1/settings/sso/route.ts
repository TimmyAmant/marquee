import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { ssoSettingsDto } from "@/lib/api/routes/sso";
import { getSsoSettingsView, removeSsoSettings, testAndSaveSsoSettings } from "@/lib/auth/sso/config";
import type { SsoSettings } from "@/lib/api/types";

const FORBIDDEN = "Only the admin can change sign-in settings.";

/** Single sign-on settings (admin). Never includes the client secret —
 * `hasClientSecret` says whether one is saved. */
export const GET = withApi(async (request): Promise<SsoSettings> => {
  await requireApiAdmin(request, FORBIDDEN);
  return ssoSettingsDto(await getSsoSettingsView(), request);
});

/** Tests the provider's discovery document, then saves. Body: the
 * `SsoSettings` fields (`configured`, `hasClientSecret` and `callbackUrl`
 * are ignored) plus `clientSecret` — missing or blank keeps the saved one
 * (only while the issuer stays the same) — and `clearClientSecret: true` for
 * a public client. `400` for a bad field, `502` when the provider can't be
 * reached or its discovery document doesn't check out. */
export const PUT = withApi(async (request): Promise<SsoSettings> => {
  await requireApiAdmin(request, FORBIDDEN);
  const body = await readJsonBody(request);
  const { settings } = unwrap(await testAndSaveSsoSettings(body));
  return ssoSettingsDto(settings, request);
});

/** Turns single sign-on off. Accounts keep their links for if it's set up
 * again with the same provider. */
export const DELETE = withApi(async (request): Promise<SsoSettings> => {
  await requireApiAdmin(request, FORBIDDEN);
  await removeSsoSettings();
  return ssoSettingsDto(null, request);
});
