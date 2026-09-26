import { beforeEach, describe, expect, it } from "vitest";
import { createLocalJWKSet, generateKeyPair } from "jose";
import {
  buildAuthorizationUrl,
  codeChallenge,
  discoveryUrl,
  exchangeCode,
  fetchDiscovery,
  fetchUserinfo,
  mergeClaims,
  newAuthRequestSecrets,
  normalizeIssuerInput,
  normalizeScopes,
  OidcError,
  parseDiscovery,
  tokenAuthMethod,
  verifyIdToken,
  type Discovery,
} from "./oidc";
import { createFakeProvider, FAKE_CLIENT, FAKE_ISSUER, type FakeProvider } from "./testing/fake-oidc-provider";

const REDIRECT = "https://marquee.example.com/api/auth/sso/callback";

let idp: FakeProvider;
let discovery: Discovery;

beforeEach(async () => {
  idp = await createFakeProvider();
  discovery = await fetchDiscovery(FAKE_ISSUER, idp.fetch);
});

/** Runs the whole code flow against the fake provider and returns what
 * Marquee would verify. */
async function signIn(claims: Record<string, unknown> = { sub: "user-1" }) {
  const secrets = newAuthRequestSecrets();
  const authUrl = buildAuthorizationUrl({ discovery, clientId: FAKE_CLIENT.clientId, redirectUri: REDIRECT, scopes: "openid email", secrets });
  const { code, state } = idp.authorize(authUrl, claims);
  expect(state).toBe(secrets.state);
  const tokens = await exchangeCode(
    { discovery, client: FAKE_CLIENT, code, redirectUri: REDIRECT, codeVerifier: secrets.codeVerifier },
    idp.fetch,
  );
  return { secrets, tokens };
}

const keys = () => createLocalJWKSet(idp.jwks);

describe("issuer input and discovery", () => {
  it("accepts the issuer or its discovery URL", () => {
    expect(normalizeIssuerInput(" https://idp.test/realms/home/.well-known/openid-configuration ")).toBe("https://idp.test/realms/home");
    expect(normalizeIssuerInput("https://idp.test/app/")).toBe("https://idp.test/app/");
    expect(normalizeIssuerInput("ftp://idp.test")).toBeNull();
    expect(normalizeIssuerInput("https://user:pw@idp.test")).toBeNull();
    expect(normalizeIssuerInput("https://idp.test/?x=1")).toBeNull();
    expect(normalizeIssuerInput("not a url")).toBeNull();
    expect(discoveryUrl("https://idp.test/app/")).toBe("https://idp.test/app/.well-known/openid-configuration");
  });

  it("keeps the issuer the provider states, trailing slash and all", async () => {
    const found = await fetchDiscovery("https://idp.test/realms/home", idp.fetch);
    expect(found.issuer).toBe(FAKE_ISSUER);
    expect(found.tokenEndpoint).toBe("https://idp.test/realms/home/token");
  });

  it("refuses a document for another issuer, or one missing endpoints", () => {
    expect(() => parseDiscovery(FAKE_ISSUER, { ...idp.discoveryDoc, issuer: "https://evil.test/" })).toThrow(OidcError);
    expect(() => parseDiscovery(FAKE_ISSUER, { ...idp.discoveryDoc, token_endpoint: undefined })).toThrow(/token/);
    expect(() => parseDiscovery(FAKE_ISSUER, { ...idp.discoveryDoc, response_types_supported: ["id_token"] })).toThrow(/code/);
    expect(() => parseDiscovery(FAKE_ISSUER, "nope")).toThrow(OidcError);
  });

  it("reports an unreachable provider as an OidcError", async () => {
    const failing = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    await expect(fetchDiscovery(FAKE_ISSUER, failing)).rejects.toThrow(/Couldn't reach/);
    await expect(fetchDiscovery("https://idp.test/other", idp.fetch)).rejects.toThrow(/404/);
  });
});

describe("authorization request", () => {
  it("sends PKCE (S256), state, nonce, the exact redirect URI and openid", () => {
    const secrets = newAuthRequestSecrets();
    const url = new URL(
      buildAuthorizationUrl({ discovery, clientId: "marquee", redirectUri: REDIRECT, scopes: "profile email", secrets }),
    );
    const p = url.searchParams;
    expect(p.get("response_type")).toBe("code");
    expect(p.get("redirect_uri")).toBe(REDIRECT);
    expect(p.get("scope")).toBe("openid profile email");
    expect(p.get("state")).toBe(secrets.state);
    expect(p.get("nonce")).toBe(secrets.nonce);
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("code_challenge")).toBe(codeChallenge(secrets.codeVerifier));
    expect(p.get("code_challenge")).not.toBe(secrets.codeVerifier);
    // Fresh secrets every time.
    expect(newAuthRequestSecrets().state).not.toBe(secrets.state);
  });

  it("normalises scopes", () => {
    expect(normalizeScopes("email, profile email")).toBe("openid email profile");
    expect(normalizeScopes("openid groups")).toBe("openid groups");
  });
});

describe("code exchange", () => {
  it("trades the code with client_secret_basic and the PKCE verifier", async () => {
    const { tokens } = await signIn();
    expect(tokens.idToken.split(".")).toHaveLength(3);
    const tokenCall = idp.requests.find((r) => r.url.endsWith("/token"))!;
    expect(new Headers(tokenCall.init?.headers).get("authorization")).toMatch(/^Basic /);
    expect(String(tokenCall.init?.body)).not.toContain("client_secret");
    expect(tokenCall.init?.redirect).toBe("manual");
  });

  it("uses client_secret_post when that's all the provider takes, and none for a public client", () => {
    expect(tokenAuthMethod({ ...discovery, tokenAuthMethods: ["client_secret_post"] }, FAKE_CLIENT)).toBe("post");
    expect(tokenAuthMethod(discovery, { clientId: "x", clientSecret: null })).toBe("none");
    expect(tokenAuthMethod({ ...discovery, tokenAuthMethods: [] }, FAKE_CLIENT)).toBe("basic");
  });

  it("fails without the right verifier, redirect URI, or a reused code", async () => {
    const secrets = newAuthRequestSecrets();
    const authUrl = buildAuthorizationUrl({ discovery, clientId: "marquee", redirectUri: REDIRECT, scopes: "openid", secrets });
    const { code } = idp.authorize(authUrl, { sub: "u" });
    await expect(
      exchangeCode({ discovery, client: FAKE_CLIENT, code, redirectUri: REDIRECT, codeVerifier: "wrong" }, idp.fetch),
    ).rejects.toThrow(/invalid_grant/);
    // The code was used up by the failed attempt, like a real provider.
    await expect(
      exchangeCode({ discovery, client: FAKE_CLIENT, code, redirectUri: REDIRECT, codeVerifier: secrets.codeVerifier }, idp.fetch),
    ).rejects.toThrow(/invalid_grant/);

    const again = idp.authorize(authUrl, { sub: "u" });
    await expect(
      exchangeCode(
        { discovery, client: FAKE_CLIENT, code: again.code, redirectUri: `${REDIRECT}x`, codeVerifier: secrets.codeVerifier },
        idp.fetch,
      ),
    ).rejects.toThrow(/invalid_grant/);
  });

  it("fails with the wrong client secret", async () => {
    const secrets = newAuthRequestSecrets();
    const authUrl = buildAuthorizationUrl({ discovery, clientId: "marquee", redirectUri: REDIRECT, scopes: "openid", secrets });
    const { code } = idp.authorize(authUrl, { sub: "u" });
    await expect(
      exchangeCode(
        { discovery, client: { clientId: "marquee", clientSecret: "nope" }, code, redirectUri: REDIRECT, codeVerifier: secrets.codeVerifier },
        idp.fetch,
      ),
    ).rejects.toThrow(/invalid_client/);
  });
});

describe("ID token", () => {
  it("verifies a good token and returns its claims", async () => {
    const { secrets, tokens } = await signIn({ sub: "user-1", email: "a@b.c" });
    const claims = await verifyIdToken(tokens.idToken, { discovery, client: FAKE_CLIENT, nonce: secrets.nonce, keys: keys() });
    expect(claims).toMatchObject({ sub: "user-1", email: "a@b.c", iss: FAKE_ISSUER, aud: "marquee" });
  });

  const verify = (idToken: string, nonce: string) =>
    verifyIdToken(idToken, { discovery, client: FAKE_CLIENT, nonce, keys: keys() });

  it("refuses another nonce (a replayed or injected token)", async () => {
    const { tokens } = await signIn();
    await expect(verify(tokens.idToken, "some-other-nonce")).rejects.toThrow(/nonce/);
  });

  it("refuses a token for another issuer or another client", async () => {
    idp.tamper = (p) => ({ ...p, iss: "https://evil.test/" });
    let run = await signIn();
    await expect(verify(run.tokens.idToken, run.secrets.nonce)).rejects.toThrow(/iss/);

    idp.tamper = (p) => ({ ...p, aud: "someone-else" });
    run = await signIn();
    await expect(verify(run.tokens.idToken, run.secrets.nonce)).rejects.toThrow(/aud/);
  });

  it("needs azp to be us when there are several audiences", async () => {
    idp.tamper = (p) => ({ ...p, aud: ["marquee", "other"] });
    let run = await signIn();
    await expect(verify(run.tokens.idToken, run.secrets.nonce)).rejects.toThrow(/azp/);

    idp.tamper = (p) => ({ ...p, aud: ["marquee", "other"], azp: "marquee" });
    run = await signIn();
    await expect(verify(run.tokens.idToken, run.secrets.nonce)).resolves.toMatchObject({ sub: "user-1" });

    idp.tamper = (p) => ({ ...p, azp: "other" });
    run = await signIn();
    await expect(verify(run.tokens.idToken, run.secrets.nonce)).rejects.toThrow(/azp/);
  });

  it("refuses an expired token, allowing a minute of clock skew", async () => {
    const now = Math.floor(Date.now() / 1000);
    idp.tamper = (p) => ({ ...p, iat: now - 600, exp: now - 120 });
    let run = await signIn();
    await expect(verify(run.tokens.idToken, run.secrets.nonce)).rejects.toThrow(/expired/);

    idp.tamper = (p) => ({ ...p, iat: now - 600, exp: now - 30 });
    run = await signIn();
    await expect(verify(run.tokens.idToken, run.secrets.nonce)).resolves.toBeTruthy();
  });

  it("refuses a token signed by anyone else", async () => {
    idp.foreignKey = (await generateKeyPair("RS256")).privateKey;
    const run = await signIn();
    await expect(verify(run.tokens.idToken, run.secrets.nonce)).rejects.toThrow(/signature/);
  });

  it("refuses unsigned tokens and algorithms the provider doesn't advertise", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ sub: "x", iss: FAKE_ISSUER, aud: "marquee" })).toString("base64url");
    await expect(verify(`${header}.${body}.`, "n")).rejects.toThrow(/isn't signed/);
    await expect(verify("garbage", "n")).rejects.toThrow(/malformed/);

    const hs = await idp.sign(
      { sub: "x", iss: FAKE_ISSUER, aud: "marquee", nonce: "n", iat: 1, exp: 9999999999 },
      { key: new TextEncoder().encode(FAKE_CLIENT.clientSecret) as unknown as CryptoKey, alg: "HS256" },
    );
    await expect(verify(hs, "n")).rejects.toThrow(/HS256/);
  });

  it("accepts HS256 signed with the client secret when the provider advertises it", async () => {
    const hs = await idp.sign(
      { sub: "x", iss: FAKE_ISSUER, aud: "marquee", nonce: "n", iat: Math.floor(Date.now() / 1000), exp: 9999999999 },
      { key: new TextEncoder().encode(FAKE_CLIENT.clientSecret) as unknown as CryptoKey, alg: "HS256" },
    );
    const hsDiscovery = { ...discovery, idTokenAlgs: ["RS256", "HS256"] };
    await expect(verifyIdToken(hs, { discovery: hsDiscovery, client: FAKE_CLIENT, nonce: "n", keys: keys() })).resolves.toMatchObject({ sub: "x" });
    await expect(
      verifyIdToken(hs, { discovery: hsDiscovery, client: { clientId: "marquee", clientSecret: "other" }, nonce: "n", keys: keys() }),
    ).rejects.toThrow(/signature/);
    await expect(
      verifyIdToken(hs, { discovery: hsDiscovery, client: { clientId: "marquee", clientSecret: null }, nonce: "n", keys: keys() }),
    ).rejects.toThrow(/secret/);
  });
});

describe("userinfo", () => {
  it("adds userinfo claims under the ID token's, only for the same subject", async () => {
    const { tokens } = await signIn({ sub: "user-1" });
    idp.userinfo = { sub: "user-1", groups: ["family"], email_verified: true, iss: "ignored" };
    const info = await fetchUserinfo({ discovery, accessToken: tokens.accessToken, subject: "user-1" }, idp.fetch);
    expect(info).toMatchObject({ groups: ["family"] });
    expect(mergeClaims({ sub: "user-1", iss: FAKE_ISSUER }, info)).toMatchObject({ iss: FAKE_ISSUER, groups: ["family"] });

    idp.userinfo = { sub: "someone-else", groups: ["admins"] };
    expect(await fetchUserinfo({ discovery, accessToken: tokens.accessToken, subject: "user-1" }, idp.fetch)).toEqual({});
    expect(await fetchUserinfo({ discovery, accessToken: null, subject: "user-1" }, idp.fetch)).toEqual({});
    expect(await fetchUserinfo({ discovery, accessToken: "bad", subject: "user-1" }, idp.fetch)).toEqual({});
  });
});
