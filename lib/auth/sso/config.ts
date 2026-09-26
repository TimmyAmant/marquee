import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { ssoSettings } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto/encryption";
import { fail, type CoreResult } from "@/lib/core-result";
import {
  fetchDiscovery,
  normalizeIssuerInput,
  normalizeScopes,
  OidcError,
  sameIssuer,
  type Discovery,
  type Fetch,
} from "@/lib/auth/sso/oidc";

// The admin's single sign-on settings (Settings → Integrations): stored in
// the one `sso_settings` row, the client secret encrypted at rest. Nothing
// here ever hands the secret to a caller outside lib/auth/sso — the
// settings view only says whether one is saved.

export const SSO_CALLBACK_PATH = "/api/auth/sso/callback";
export const DEFAULT_SSO_SCOPES = "openid profile email";
export const DEFAULT_GROUPS_CLAIM = "groups";

export type SsoConfig = {
  name: string;
  issuer: string;
  clientId: string;
  clientSecret: string | null;
  scopes: string;
  /** Marquee's own origin as the identity provider knows it. */
  publicUrl: string;
  allowSignup: boolean;
  matchEmail: boolean;
  requiredGroup: string | null;
  trustedGroup: string | null;
  groupsClaim: string;
};

/** What Settings shows: everything but the secret. */
export type SsoSettingsView = Omit<SsoConfig, "clientSecret"> & { hasClientSecret: boolean; callbackUrl: string };

export function callbackUrlFor(publicUrl: string): string {
  return `${publicUrl.replace(/\/+$/, "")}${SSO_CALLBACK_PATH}`;
}

export async function getSsoConfig(): Promise<SsoConfig | null> {
  const [row] = await db.select().from(ssoSettings).limit(1);
  if (!row) return null;
  const clientSecret =
    row.clientSecretEnc && row.clientSecretIv && row.clientSecretTag
      ? decryptSecret({ ciphertext: row.clientSecretEnc, iv: row.clientSecretIv, tag: row.clientSecretTag })
      : null;
  return {
    name: row.name,
    issuer: row.issuer,
    clientId: row.clientId,
    clientSecret,
    scopes: row.scopes,
    publicUrl: row.publicUrl,
    allowSignup: row.allowSignup,
    matchEmail: row.matchEmail,
    requiredGroup: row.requiredGroup,
    trustedGroup: row.trustedGroup,
    groupsClaim: row.groupsClaim,
  };
}

/** Just the name, for the sign-in button — no decryption. */
export async function getSsoButton(): Promise<{ name: string; signup: boolean } | null> {
  const [row] = await db
    .select({ name: ssoSettings.name, signup: ssoSettings.allowSignup })
    .from(ssoSettings)
    .limit(1);
  return row ?? null;
}

export function toSettingsView(config: SsoConfig): SsoSettingsView {
  const { clientSecret, ...rest } = config;
  return { ...rest, hasClientSecret: clientSecret !== null, callbackUrl: callbackUrlFor(config.publicUrl) };
}

export async function getSsoSettingsView(): Promise<SsoSettingsView | null> {
  const config = await getSsoConfig();
  return config ? toSettingsView(config) : null;
}

// ── Input ──────────────────────────────────────────────────────────────────

export type SsoSettingsInput = {
  name?: unknown;
  issuer?: unknown;
  clientId?: unknown;
  /** Missing or blank keeps the saved secret; `clearClientSecret` removes it. */
  clientSecret?: unknown;
  clearClientSecret?: unknown;
  scopes?: unknown;
  publicUrl?: unknown;
  allowSignup?: unknown;
  matchEmail?: unknown;
  requiredGroup?: unknown;
  trustedGroup?: unknown;
  groupsClaim?: unknown;
};

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalText(value: unknown, max: number): string | null {
  const t = text(value, max);
  return t ? t : null;
}

/** Marquee's address: an http(s) origin (any path is dropped). */
export function normalizePublicUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Validates the form without touching the network. Pure; unit tested. */
export function parseSsoSettingsInput(
  input: SsoSettingsInput,
  existing: Pick<SsoConfig, "clientSecret" | "issuer"> | null,
): CoreResult<{ config: SsoConfig }> {
  const name = text(input.name, 40);
  if (!name) return fail("invalid", "Give the sign-in button a name, like Authentik.");
  const issuer = normalizeIssuerInput(text(input.issuer, 500));
  if (!issuer) return fail("invalid", "Enter the provider's issuer URL (starting with https://).");
  const clientId = text(input.clientId, 500);
  if (!clientId) return fail("invalid", "Enter the client ID from your identity provider.");
  const publicUrl = normalizePublicUrl(text(input.publicUrl, 500));
  if (!publicUrl) return fail("invalid", "Enter Marquee's address, like https://marquee.example.com.");

  const typedSecret = typeof input.clientSecret === "string" ? input.clientSecret.trim() : "";
  if (typedSecret.length > 1000) return fail("invalid", "That client secret is too long.");
  // The saved secret is only ever sent back to the provider it was made
  // for: pointing Marquee at another issuer needs it typed again.
  const keptSecret =
    input.clearClientSecret === true || !existing || !sameIssuer(existing.issuer, issuer) ? null : existing.clientSecret;
  if (!typedSecret && input.clearClientSecret !== true && existing?.clientSecret && !keptSecret) {
    return fail("invalid", "Enter the client secret again — the saved one belongs to the previous provider.");
  }
  const clientSecret = typedSecret || keptSecret;

  const groupsClaim = text(input.groupsClaim, 100) || DEFAULT_GROUPS_CLAIM;
  if (!/^[A-Za-z0-9_:.\-/]+$/.test(groupsClaim)) return fail("invalid", "The groups claim can only be a claim name.");

  return {
    ok: true,
    config: {
      name,
      issuer,
      clientId,
      clientSecret,
      scopes: normalizeScopes(text(input.scopes, 500) || DEFAULT_SSO_SCOPES),
      publicUrl,
      allowSignup: input.allowSignup === true,
      matchEmail: input.matchEmail === true,
      requiredGroup: optionalText(input.requiredGroup, 200),
      trustedGroup: optionalText(input.trustedGroup, 200),
      groupsClaim,
    },
  };
}

export type SsoTestResult = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string | null;
  /** Things that work but deserve a second look. */
  warnings: string[];
};

export function testResultFor(discovery: Discovery): SsoTestResult {
  const warnings: string[] = [];
  if (!discovery.issuer.startsWith("https://")) {
    warnings.push("The provider isn't using https — sign-ins and the client secret travel unencrypted.");
  }
  return {
    issuer: discovery.issuer,
    authorizationEndpoint: discovery.authorizationEndpoint,
    tokenEndpoint: discovery.tokenEndpoint,
    userinfoEndpoint: discovery.userinfoEndpoint,
    warnings,
  };
}

/** "Test": fetches and checks the provider's discovery document. */
export async function testSsoIssuer(rawIssuer: unknown, fetchImpl?: Fetch): Promise<CoreResult<{ result: SsoTestResult }>> {
  const issuer = normalizeIssuerInput(typeof rawIssuer === "string" ? rawIssuer : "");
  if (!issuer) return fail("invalid", "Enter the provider's issuer URL (starting with https://).");
  try {
    return { ok: true, result: testResultFor(await fetchDiscovery(issuer, fetchImpl)) };
  } catch (err) {
    return fail("upstream", err instanceof OidcError ? err.message : "Couldn't reach the identity provider.");
  }
}

/** Tests the provider, then saves: the issuer stored is the one its
 * discovery document states (so ID tokens can be checked against it
 * exactly). */
export async function testAndSaveSsoSettings(input: SsoSettingsInput): Promise<CoreResult<{ settings: SsoSettingsView }>> {
  const existing = await getSsoConfig();
  const parsed = parseSsoSettingsInput(input, existing);
  if (!parsed.ok) return parsed;
  let discovery: Discovery;
  try {
    discovery = await fetchDiscovery(parsed.config.issuer);
  } catch (err) {
    return fail("upstream", err instanceof OidcError ? err.message : "Couldn't reach the identity provider.");
  }
  const config: SsoConfig = { ...parsed.config, issuer: discovery.issuer };
  const secret = config.clientSecret ? encryptSecret(config.clientSecret) : null;
  const values = {
    name: config.name,
    issuer: config.issuer,
    clientId: config.clientId,
    clientSecretEnc: secret?.ciphertext ?? null,
    clientSecretIv: secret?.iv ?? null,
    clientSecretTag: secret?.tag ?? null,
    scopes: config.scopes,
    publicUrl: config.publicUrl,
    allowSignup: config.allowSignup,
    matchEmail: config.matchEmail,
    requiredGroup: config.requiredGroup,
    trustedGroup: config.trustedGroup,
    groupsClaim: config.groupsClaim,
    updatedAt: new Date(),
  };
  await db
    .insert(ssoSettings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: ssoSettings.id, set: values });
  return { ok: true, settings: toSettingsView(config) };
}

/** Turns SSO off. Accounts keep their links, so setting the same provider
 * up again brings them back. */
export async function removeSsoSettings(): Promise<void> {
  await db.delete(ssoSettings).where(eq(ssoSettings.id, 1));
}
