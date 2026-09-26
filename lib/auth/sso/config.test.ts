import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { callbackUrlFor, normalizePublicUrl, parseSsoSettingsInput, testResultFor, toSettingsView, type SsoConfig } from "./config";

const input = {
  name: " Authentik ",
  issuer: "https://auth.example.com/application/o/marquee/.well-known/openid-configuration",
  clientId: "marquee",
  clientSecret: "shh",
  scopes: "profile email groups",
  publicUrl: "https://marquee.example.com/some/path",
  allowSignup: true,
  matchEmail: "yes",
  requiredGroup: "  ",
  trustedGroup: "trusted",
  groupsClaim: "",
};

describe("parseSsoSettingsInput", () => {
  it("cleans up what the admin typed", () => {
    const parsed = parseSsoSettingsInput(input, null);
    expect(parsed).toEqual({
      ok: true,
      config: {
        name: "Authentik",
        issuer: "https://auth.example.com/application/o/marquee",
        clientId: "marquee",
        clientSecret: "shh",
        scopes: "openid profile email groups",
        publicUrl: "https://marquee.example.com",
        allowSignup: true,
        // Only a real `true` turns the risky options on.
        matchEmail: false,
        requiredGroup: null,
        trustedGroup: "trusted",
        groupsClaim: "groups",
      },
    });
  });

  it("refuses missing or malformed fields", () => {
    expect(parseSsoSettingsInput({ ...input, name: "" }, null)).toMatchObject({ ok: false, code: "invalid" });
    expect(parseSsoSettingsInput({ ...input, issuer: "javascript:alert(1)" }, null)).toMatchObject({ ok: false });
    expect(parseSsoSettingsInput({ ...input, clientId: "  " }, null)).toMatchObject({ ok: false });
    expect(parseSsoSettingsInput({ ...input, publicUrl: "marquee.local" }, null)).toMatchObject({ ok: false });
    expect(parseSsoSettingsInput({ ...input, groupsClaim: "a b" }, null)).toMatchObject({ ok: false });
  });

  const saved = { clientSecret: "old-secret", issuer: "https://auth.example.com/application/o/marquee/" };

  it("keeps the saved secret when none is typed, for the same provider", () => {
    const parsed = parseSsoSettingsInput({ ...input, clientSecret: "" }, saved);
    expect(parsed.ok && parsed.config.clientSecret).toBe("old-secret");
    const replaced = parseSsoSettingsInput({ ...input, clientSecret: "new" }, saved);
    expect(replaced.ok && replaced.config.clientSecret).toBe("new");
    const cleared = parseSsoSettingsInput({ ...input, clientSecret: "", clearClientSecret: true }, saved);
    expect(cleared.ok && cleared.config.clientSecret).toBeNull();
  });

  it("never sends the saved secret to a different provider", () => {
    expect(parseSsoSettingsInput({ ...input, issuer: "https://evil.example.net/", clientSecret: "" }, saved)).toMatchObject({
      ok: false,
      error: expect.stringContaining("client secret again"),
    });
    const retyped = parseSsoSettingsInput({ ...input, issuer: "https://other.example.net/", clientSecret: "typed" }, saved);
    expect(retyped.ok && retyped.config.clientSecret).toBe("typed");
    // A public client moving providers is fine.
    const publicClient = parseSsoSettingsInput(
      { ...input, issuer: "https://other.example.net/", clientSecret: "" },
      { ...saved, clientSecret: null },
    );
    expect(publicClient.ok && publicClient.config.clientSecret).toBeNull();
  });
});

describe("settings view", () => {
  it("never includes the client secret", () => {
    const config: SsoConfig = {
      name: "Authentik",
      issuer: "https://idp/",
      clientId: "c",
      clientSecret: "TOP-SECRET",
      scopes: "openid",
      publicUrl: "https://m.example.com",
      allowSignup: false,
      matchEmail: false,
      requiredGroup: null,
      trustedGroup: null,
      groupsClaim: "groups",
    };
    const view = toSettingsView(config);
    expect(JSON.stringify(view)).not.toContain("TOP-SECRET");
    expect(view).toMatchObject({ hasClientSecret: true, callbackUrl: "https://m.example.com/api/auth/sso/callback" });
    expect(toSettingsView({ ...config, clientSecret: null }).hasClientSecret).toBe(false);
  });

  it("builds the redirect URI and address", () => {
    expect(callbackUrlFor("https://m.example.com/")).toBe("https://m.example.com/api/auth/sso/callback");
    expect(normalizePublicUrl("http://192.168.1.5:3000/login")).toBe("http://192.168.1.5:3000");
    expect(normalizePublicUrl("https://u:p@m.example.com")).toBeNull();
  });

  it("warns about a provider without https", () => {
    const base = { authorizationEndpoint: "a", tokenEndpoint: "t", jwksUri: "j", userinfoEndpoint: null, tokenAuthMethods: [], idTokenAlgs: ["RS256"] };
    expect(testResultFor({ ...base, issuer: "http://idp.lan/" }).warnings).toHaveLength(1);
    expect(testResultFor({ ...base, issuer: "https://idp/" }).warnings).toHaveLength(0);
  });
});
