import { createHash, randomBytes } from "crypto";
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  errors as joseErrors,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

// The OpenID Connect authorization-code flow with PKCE, state and nonce, as
// Marquee's single sign-on uses it (lib/auth/sso/signin.ts). Written against
// the specs directly (OpenID Connect Core 1.0 §3.1, Discovery 1.0, RFC 7636)
// rather than NextAuth's OIDC provider: the provider is configured by the
// admin at runtime and sign-in also has to work for the Mac and Windows apps,
// which get an API token rather than a browser session. The pieces that talk
// to the network take a `fetch`, so the tests drive them with a fake
// provider.

export type Fetch = typeof fetch;

const TIMEOUT_MS = 10_000;
/** How far the provider's clock may be off from ours. */
const CLOCK_TOLERANCE_S = 60;

export class OidcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OidcError";
  }
}

export type Discovery = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  userinfoEndpoint: string | null;
  tokenAuthMethods: string[];
  /** Algorithms the provider may sign id_tokens with (defaults to RS256). */
  idTokenAlgs: string[];
};

/** Takes what the admin pasted — the issuer, or its discovery URL — and
 * gives back the issuer to look up. Null when it isn't an http(s) URL. */
export function normalizeIssuerInput(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/\.well-known\/openid-configuration\/?$/, "");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return trimmed;
}

export function discoveryUrl(issuer: string): string {
  return `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;
}

/** Issuers are compared exactly (Discovery §4.3), except for a trailing
 * slash the admin may or may not have typed. */
export function sameIssuer(a: string, b: string): boolean {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Checks a discovery document fetched for `issuer`. Pure; unit tested. */
export function parseDiscovery(issuer: string, body: unknown): Discovery {
  if (!body || typeof body !== "object") throw new OidcError("The discovery document isn't JSON.");
  const doc = body as Record<string, unknown>;
  if (typeof doc.issuer !== "string" || !sameIssuer(doc.issuer, issuer)) {
    throw new OidcError(
      `The provider calls itself "${String(doc.issuer ?? "")}", not "${issuer}". Use its issuer URL exactly.`,
    );
  }
  const authorizationEndpoint = httpUrl(doc.authorization_endpoint);
  const tokenEndpoint = httpUrl(doc.token_endpoint);
  const jwksUri = httpUrl(doc.jwks_uri);
  if (!authorizationEndpoint || !tokenEndpoint || !jwksUri) {
    throw new OidcError("The discovery document is missing its authorization, token or keys endpoint.");
  }
  const responseTypes = stringList(doc.response_types_supported);
  if (responseTypes.length > 0 && !responseTypes.includes("code")) {
    throw new OidcError("The provider doesn't support the authorization-code flow.");
  }
  const algs = stringList(doc.id_token_signing_alg_values_supported).filter((a) => a !== "none");
  return {
    issuer: doc.issuer,
    authorizationEndpoint,
    tokenEndpoint,
    jwksUri,
    userinfoEndpoint: httpUrl(doc.userinfo_endpoint),
    tokenAuthMethods: stringList(doc.token_endpoint_auth_methods_supported),
    idTokenAlgs: algs.length > 0 ? algs : ["RS256"],
  };
}

export async function fetchDiscovery(issuer: string, fetchImpl: Fetch = fetch): Promise<Discovery> {
  let res: Response;
  try {
    res = await fetchImpl(discoveryUrl(issuer), {
      headers: { Accept: "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new OidcError(`Couldn't reach ${discoveryUrl(issuer)}.`);
  }
  if (!res.ok) throw new OidcError(`${discoveryUrl(issuer)} answered ${res.status}.`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new OidcError("The discovery document isn't JSON.");
  }
  return parseDiscovery(issuer, body);
}

// ── Authorization request ──────────────────────────────────────────────────

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export type AuthRequestSecrets = { state: string; nonce: string; codeVerifier: string };

export function newAuthRequestSecrets(): AuthRequestSecrets {
  return { state: randomToken(), nonce: randomToken(), codeVerifier: randomToken() };
}

export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Scopes as the admin typed them, always including `openid`. */
export function normalizeScopes(raw: string): string {
  const scopes = raw.split(/[\s,]+/).filter(Boolean);
  if (!scopes.includes("openid")) scopes.unshift("openid");
  return [...new Set(scopes)].join(" ");
}

export function buildAuthorizationUrl(input: {
  discovery: Discovery;
  clientId: string;
  redirectUri: string;
  scopes: string;
  secrets: AuthRequestSecrets;
}): string {
  const url = new URL(input.discovery.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", normalizeScopes(input.scopes));
  url.searchParams.set("state", input.secrets.state);
  url.searchParams.set("nonce", input.secrets.nonce);
  url.searchParams.set("code_challenge", codeChallenge(input.secrets.codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

// ── Token exchange ─────────────────────────────────────────────────────────

export type Client = { clientId: string; clientSecret: string | null };

/** client_secret_basic unless the provider only takes client_secret_post;
 * "none" (PKCE only) for a public client without a secret. */
export function tokenAuthMethod(discovery: Discovery, client: Client): "basic" | "post" | "none" {
  if (!client.clientSecret) return "none";
  const methods = discovery.tokenAuthMethods;
  if (methods.length === 0 || methods.includes("client_secret_basic")) return "basic";
  return methods.includes("client_secret_post") ? "post" : "basic";
}

export type TokenResponse = { idToken: string; accessToken: string | null };

export async function exchangeCode(
  input: { discovery: Discovery; client: Client; code: string; redirectUri: string; codeVerifier: string },
  fetchImpl: Fetch = fetch,
): Promise<TokenResponse> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
  });
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const method = tokenAuthMethod(input.discovery, input.client);
  if (method === "basic") {
    // RFC 6749 §2.3.1: both halves form-encoded before base64.
    const enc = (v: string) => encodeURIComponent(v).replace(/%20/g, "+");
    headers.Authorization = `Basic ${Buffer.from(`${enc(input.client.clientId)}:${enc(input.client.clientSecret!)}`).toString("base64")}`;
  } else {
    form.set("client_id", input.client.clientId);
    if (method === "post") form.set("client_secret", input.client.clientSecret!);
  }

  let res: Response;
  try {
    res = await fetchImpl(input.discovery.tokenEndpoint, {
      method: "POST",
      headers,
      body: form.toString(),
      // Never re-send the client secret wherever a redirect points.
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new OidcError("Couldn't reach the identity provider's token endpoint.");
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // Handled below.
  }
  if (!res.ok) {
    const code = typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
    throw new OidcError(`The identity provider refused the sign-in (${code}).`);
  }
  if (typeof body.id_token !== "string" || !body.id_token) {
    throw new OidcError("The identity provider didn't send an ID token. Is the \"openid\" scope allowed?");
  }
  return {
    idToken: body.id_token,
    accessToken: typeof body.access_token === "string" && body.access_token ? body.access_token : null,
  };
}

// ── ID token ───────────────────────────────────────────────────────────────

declare global {
  var __marqueeOidcJwks: Map<string, JWTVerifyGetKey> | undefined;
}
const jwksCache: Map<string, JWTVerifyGetKey> = (globalThis.__marqueeOidcJwks ??= new Map());

/** The provider's signing keys, fetched (and re-fetched on rotation) by jose. */
export function remoteKeys(jwksUri: string): JWTVerifyGetKey {
  let keys = jwksCache.get(jwksUri);
  if (!keys) {
    if (jwksCache.size > 8) jwksCache.clear();
    keys = createRemoteJWKSet(new URL(jwksUri), { timeoutDuration: TIMEOUT_MS });
    jwksCache.set(jwksUri, keys);
  }
  return keys;
}

/**
 * Verifies an ID token (Core §3.1.3.7): signed by the provider's keys (or,
 * for HS* algorithms, by the client secret), issued by exactly this issuer,
 * for this client (`aud`, and `azp` when there are several audiences), not
 * expired, not from the future, and carrying the nonce this sign-in sent.
 * Returns its claims.
 */
export async function verifyIdToken(
  idToken: string,
  input: { discovery: Discovery; client: Client; nonce: string; keys?: JWTVerifyGetKey; now?: Date },
): Promise<JWTPayload> {
  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(idToken).alg;
  } catch {
    throw new OidcError("The ID token is malformed.");
  }
  if (!alg || alg === "none") throw new OidcError("The ID token isn't signed.");
  const symmetric = alg.startsWith("HS");
  if (symmetric && !input.client.clientSecret) throw new OidcError("The ID token is signed with a secret this client doesn't have.");
  if (!input.discovery.idTokenAlgs.includes(alg)) throw new OidcError(`The ID token is signed with ${alg}, which the provider doesn't advertise.`);

  const options = {
    issuer: input.discovery.issuer,
    audience: input.client.clientId,
    algorithms: [alg],
    clockTolerance: CLOCK_TOLERANCE_S,
    requiredClaims: ["sub", "exp", "iat"],
    currentDate: input.now,
  };
  let payload: JWTPayload;
  try {
    const result = symmetric
      ? await jwtVerify(idToken, new TextEncoder().encode(input.client.clientSecret!), options)
      : await jwtVerify(idToken, input.keys ?? remoteKeys(input.discovery.jwksUri), options);
    payload = result.payload;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) throw new OidcError("The ID token has expired.");
    if (err instanceof joseErrors.JWTClaimValidationFailed) {
      throw new OidcError(`The ID token's "${err.claim}" claim doesn't match.`);
    }
    throw new OidcError("The ID token's signature doesn't check out.");
  }

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (audiences.length > 1 && payload.azp !== input.client.clientId) {
    throw new OidcError('The ID token\'s "azp" claim doesn\'t match.');
  }
  if (payload.azp !== undefined && payload.azp !== input.client.clientId) {
    throw new OidcError('The ID token\'s "azp" claim doesn\'t match.');
  }
  if (typeof payload.nonce !== "string" || payload.nonce !== input.nonce) {
    throw new OidcError('The ID token\'s "nonce" claim doesn\'t match.');
  }
  return payload;
}

/**
 * The userinfo endpoint's claims (often where `groups` or `email_verified`
 * live), or {} when there's no endpoint, no access token, or it fails. Its
 * `sub` must be the ID token's (Core §5.3.2), or none of it is used.
 */
export async function fetchUserinfo(
  input: { discovery: Discovery; accessToken: string | null; subject: string },
  fetchImpl: Fetch = fetch,
): Promise<Record<string, unknown>> {
  if (!input.discovery.userinfoEndpoint || !input.accessToken) return {};
  try {
    const res = await fetchImpl(input.discovery.userinfoEndpoint, {
      headers: { Accept: "application/json", Authorization: `Bearer ${input.accessToken}` },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return {};
    const body = (await res.json()) as Record<string, unknown>;
    return body && typeof body === "object" && body.sub === input.subject ? body : {};
  } catch {
    return {};
  }
}

/** The ID token's claims with the userinfo's added under them: the ID
 * token's own values (iss, aud, sub, nonce…) always win. */
export function mergeClaims(idClaims: JWTPayload, userinfo: Record<string, unknown>): Record<string, unknown> {
  return { ...userinfo, ...idClaims };
}
