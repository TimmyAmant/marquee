import { createHash, randomBytes } from "crypto";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";

// A tiny, in-process OpenID Connect provider for the SSO tests: serves a
// discovery document, JWKS, token and userinfo endpoints through a `fetch`
// function, and plays the browser's part of the authorization request.
// It checks what a real provider would (client auth, exact redirect URI,
// PKCE), so tests fail if Marquee stops sending them right. Only used by
// *.test.ts files.

export const FAKE_ISSUER = "https://idp.test/realms/home/";
export const FAKE_CLIENT = { clientId: "marquee", clientSecret: "s3cret value" };

type Pending = {
  clientId: string;
  redirectUri: string;
  nonce: string;
  challenge: string;
  claims: Record<string, unknown>;
};

export type FakeProvider = {
  issuer: string;
  discoveryDoc: Record<string, unknown>;
  fetch: typeof fetch;
  jwks: { keys: JWK[] };
  /** Plays the browser at the provider's authorization endpoint: approves
   * the request as someone with `claims` (must include `sub`), and returns
   * the redirect back with its `code` and `state`. */
  authorize(authUrl: string, claims: Record<string, unknown>): { code: string; state: string; redirect: URL };
  /** Signs an ID token with the provider's key (or another). */
  sign(payload: Record<string, unknown>, options?: { key?: CryptoKey; alg?: string; kid?: string }): Promise<string>;
  /** Changes what the next token response's ID token says. */
  tamper: ((payload: Record<string, unknown>) => Record<string, unknown>) | null;
  /** Signs the next ID token with this key instead. */
  foreignKey: CryptoKey | null;
  userinfo: Record<string, unknown> | null;
  requests: { url: string; init?: RequestInit }[];
};

export async function createFakeProvider(issuer = FAKE_ISSUER): Promise<FakeProvider> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  const base = issuer.replace(/\/+$/, "");
  const discoveryDoc = {
    issuer,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    jwks_uri: `${base}/jwks`,
    userinfo_endpoint: `${base}/userinfo`,
    response_types_supported: ["code"],
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    code_challenge_methods_supported: ["S256"],
  };
  const pending = new Map<string, Pending>();
  const accessTokens = new Map<string, Record<string, unknown>>();

  const provider: FakeProvider = {
    issuer,
    discoveryDoc,
    jwks: { keys: [jwk] },
    tamper: null,
    foreignKey: null,
    userinfo: null,
    requests: [],

    authorize(authUrl, claims) {
      const url = new URL(authUrl);
      if (`${url.origin}${url.pathname}` !== discoveryDoc.authorization_endpoint) throw new Error("not our authorize URL");
      const p = url.searchParams;
      if (p.get("response_type") !== "code" || p.get("code_challenge_method") !== "S256") throw new Error("bad request");
      const code = randomBytes(16).toString("hex");
      pending.set(code, {
        clientId: p.get("client_id")!,
        redirectUri: p.get("redirect_uri")!,
        nonce: p.get("nonce")!,
        challenge: p.get("code_challenge")!,
        claims,
      });
      const redirect = new URL(p.get("redirect_uri")!);
      redirect.searchParams.set("code", code);
      redirect.searchParams.set("state", p.get("state")!);
      return { code, state: p.get("state")!, redirect };
    },

    async sign(payload, options = {}) {
      return new SignJWT(payload)
        .setProtectedHeader({ alg: options.alg ?? "RS256", kid: options.kid ?? "k1" })
        .sign(options.key ?? privateKey);
    },

    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      provider.requests.push({ url: url.href, init });
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

      if (url.href === `${base}/.well-known/openid-configuration`) return json(discoveryDoc);
      if (url.href === discoveryDoc.jwks_uri) return json(provider.jwks);
      if (url.href === discoveryDoc.userinfo_endpoint) {
        const auth = new Headers(init?.headers).get("authorization") ?? "";
        const claims = accessTokens.get(auth.replace(/^Bearer /, ""));
        if (!claims) return json({ error: "invalid_token" }, 401);
        return json(provider.userinfo ?? { sub: claims.sub });
      }
      if (url.href === discoveryDoc.token_endpoint) {
        const form = new URLSearchParams(String(init?.body ?? ""));
        const headers = new Headers(init?.headers);
        const basic = headers.get("authorization");
        let clientId = form.get("client_id");
        let clientSecret = form.get("client_secret");
        if (basic?.startsWith("Basic ")) {
          const [id, secret] = Buffer.from(basic.slice(6), "base64").toString().split(":");
          const dec = (v: string) => decodeURIComponent(v.replace(/\+/g, " "));
          clientId = dec(id);
          clientSecret = dec(secret);
        }
        if (clientId !== FAKE_CLIENT.clientId || clientSecret !== FAKE_CLIENT.clientSecret) {
          return json({ error: "invalid_client" }, 401);
        }
        const code = form.get("code") ?? "";
        const entry = pending.get(code);
        pending.delete(code);
        if (!entry || form.get("grant_type") !== "authorization_code") return json({ error: "invalid_grant" }, 400);
        if (form.get("redirect_uri") !== entry.redirectUri) return json({ error: "invalid_grant" }, 400);
        const verifier = form.get("code_verifier") ?? "";
        if (createHash("sha256").update(verifier).digest("base64url") !== entry.challenge) {
          return json({ error: "invalid_grant" }, 400);
        }
        const now = Math.floor(Date.now() / 1000);
        let payload: Record<string, unknown> = {
          iss: issuer,
          aud: entry.clientId,
          iat: now,
          exp: now + 300,
          nonce: entry.nonce,
          ...entry.claims,
        };
        if (provider.tamper) payload = provider.tamper(payload);
        const idToken = await provider.sign(payload, provider.foreignKey ? { key: provider.foreignKey } : {});
        const accessToken = randomBytes(16).toString("hex");
        accessTokens.set(accessToken, payload);
        return json({ access_token: accessToken, token_type: "Bearer", id_token: idToken, expires_in: 300 });
      }
      return json({ error: "not_found" }, 404);
    }) as typeof fetch,
  };
  return provider;
}
