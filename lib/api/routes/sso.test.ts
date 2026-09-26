import { beforeEach, describe, expect, it, vi } from "vitest";

// The /api/v1 single sign-on and Quick Connect routes through withApi and
// the real bearer-token checks, with the SSO/Quick Connect logic itself
// mocked (it's tested in lib/auth/sso and lib/auth/media-signin.test.ts).

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";

const tokens: Record<string, { id: string; role: "admin" | "member" }> = {
  ["mqt_" + "a".repeat(43)]: { id: ADMIN_ID, role: "admin" },
  ["mqt_" + "m".repeat(43)]: { id: MEMBER_ID, role: "member" },
};
const userRow = (id: string, role: "admin" | "member") => ({
  id,
  username: role,
  displayName: null,
  role,
  autoApproveMovies: false,
  autoApproveTv: false,
  avatarUpdatedAt: null,
  createdAt: new Date("2026-09-01"),
});

vi.mock("@/lib/api/token-store", () => ({
  authenticateApiToken: async (token: string) => {
    const user = tokens[token];
    if (!user) return null;
    return { tokenId: "t", tokenName: "test", expiresAt: new Date("2030-01-01"), user: userRow(user.id, user.role) };
  },
  issueApiToken: async () => ({ token: "mqt_" + "n".repeat(43), expiresAt: new Date("2026-12-01T00:00:00Z") }),
}));
vi.mock("@/lib/integrations/library-owner", () => ({ getLibraryOwnerUserId: async () => ADMIN_ID }));
vi.mock("@/lib/auth/get-admin", () => ({ getAdminUserId: async () => ADMIN_ID }));

const sso = vi.hoisted(() => ({
  startAppSsoSignIn: vi.fn(),
  pollAppSsoSignIn: vi.fn(),
  startAppSsoLink: vi.fn(),
  pollAppSsoLink: vi.fn(),
  unlinkSso: vi.fn(),
}));
vi.mock("@/lib/auth/sso/signin", () => sso);

const ssoConfig = vi.hoisted(() => ({
  getSsoSettingsView: vi.fn(),
  testAndSaveSsoSettings: vi.fn(),
  removeSsoSettings: vi.fn(),
  testSsoIssuer: vi.fn(),
}));
vi.mock("@/lib/auth/sso/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/sso/config")>()),
  ...ssoConfig,
}));

const media = vi.hoisted(() => ({ startQuickConnect: vi.fn(), pollQuickConnect: vi.fn() }));
vi.mock("@/lib/auth/media-signin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/media-signin")>()),
  ...media,
}));

import * as settingsRoute from "@/app/api/v1/settings/sso/route";
import * as testRoute from "@/app/api/v1/settings/sso/test/route";
import * as startRoute from "@/app/api/v1/auth/sso/start/route";
import * as pollRoute from "@/app/api/v1/auth/sso/poll/route";
import * as linkStartRoute from "@/app/api/v1/me/links/sso/start/route";
import * as qcStartRoute from "@/app/api/v1/auth/jellyfin/quick-connect/start/route";
import * as qcPollRoute from "@/app/api/v1/auth/jellyfin/quick-connect/poll/route";
import { toSettingsView } from "@/lib/auth/sso/config";

const ADMIN = "mqt_" + "a".repeat(43);
const MEMBER = "mqt_" + "m".repeat(43);

function call(
  handler: (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>,
  { method = "GET", token, body }: { method?: string; token?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = { host: "marquee.local:3000", "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const request = new Request("http://marquee.local:3000/api/v1/x", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handler(request, { params: Promise.resolve({}) });
}

const savedView = toSettingsView({
  name: "Authentik",
  issuer: "https://auth.example.com/application/o/marquee/",
  clientId: "marquee",
  clientSecret: "TOP-SECRET-VALUE",
  scopes: "openid profile email",
  publicUrl: "https://marquee.example.com",
  allowSignup: false,
  matchEmail: false,
  requiredGroup: "marquee-users",
  trustedGroup: null,
  groupsClaim: "groups",
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/settings/sso", () => {
  it("shows the admin the settings, never the client secret", async () => {
    ssoConfig.getSsoSettingsView.mockResolvedValue(savedView);
    const res = await call(settingsRoute.GET, { token: ADMIN });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("TOP-SECRET-VALUE");
    expect(JSON.parse(text)).toMatchObject({
      configured: true,
      hasClientSecret: true,
      callbackUrl: "https://marquee.example.com/api/auth/sso/callback",
    });
  });

  it("offers defaults, with this address, before it's set up", async () => {
    ssoConfig.getSsoSettingsView.mockResolvedValue(null);
    const body = await (await call(settingsRoute.GET, { token: ADMIN })).json();
    expect(body).toMatchObject({
      configured: false,
      scopes: "openid profile email",
      publicUrl: "http://marquee.local:3000",
      callbackUrl: "http://marquee.local:3000/api/auth/sso/callback",
    });
  });

  it("is the admin's only", async () => {
    for (const handler of [settingsRoute.GET, settingsRoute.PUT, settingsRoute.DELETE, testRoute.POST]) {
      expect((await call(handler, { method: "POST", token: MEMBER, body: {} })).status).toBe(403);
      expect((await call(handler, { method: "POST", body: {} })).status).toBe(401);
    }
    expect(ssoConfig.testAndSaveSsoSettings).not.toHaveBeenCalled();
    expect(ssoConfig.removeSsoSettings).not.toHaveBeenCalled();
  });

  it("saves through test-and-save and reports its failures", async () => {
    ssoConfig.testAndSaveSsoSettings.mockResolvedValue({ ok: true, settings: savedView });
    const saved = await call(settingsRoute.PUT, { method: "PUT", token: ADMIN, body: { name: "Authentik", clientSecret: "x" } });
    expect(saved.status).toBe(200);
    expect(await saved.text()).not.toContain("TOP-SECRET-VALUE");
    expect(ssoConfig.testAndSaveSsoSettings).toHaveBeenCalledWith({ name: "Authentik", clientSecret: "x" });

    ssoConfig.testAndSaveSsoSettings.mockResolvedValue({ ok: false, code: "upstream", error: "https://idp answered 404." });
    const failed = await call(settingsRoute.PUT, { method: "PUT", token: ADMIN, body: {} });
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ code: "upstream", error: "https://idp answered 404." });
  });

  it("tests an issuer", async () => {
    ssoConfig.testSsoIssuer.mockResolvedValue({
      ok: true,
      result: { issuer: "https://idp/", authorizationEndpoint: "a", tokenEndpoint: "t", userinfoEndpoint: null, warnings: [] },
    });
    const res = await call(testRoute.POST, { method: "POST", token: ADMIN, body: { issuer: "https://idp/" } });
    expect(await res.json()).toMatchObject({ issuer: "https://idp/", warnings: [] });
    expect(ssoConfig.testSsoIssuer).toHaveBeenCalledWith("https://idp/");
  });
});

describe("/auth/sso", () => {
  it("starts publicly and hands out the handle and page", async () => {
    sso.startAppSsoSignIn.mockResolvedValue({
      ok: true,
      handle: "h".repeat(43),
      authUrl: "https://marquee.example.com/login/sso/app?key=k",
      expiresAt: new Date("2026-09-25T17:40:00.000Z"),
    });
    const res = await call(startRoute.POST, { method: "POST", body: { deviceName: "  Anna's Mac " } });
    expect(await res.json()).toEqual({
      handle: "h".repeat(43),
      authUrl: "https://marquee.example.com/login/sso/app?key=k",
      expiresAt: "2026-09-25T17:40:00.000Z",
    });
    expect(sso.startAppSsoSignIn).toHaveBeenCalledWith(null, "Anna's Mac");
  });

  it("answers 409 when SSO isn't set up", async () => {
    sso.startAppSsoSignIn.mockResolvedValue({ ok: false, code: "conflict", error: "Single sign-on isn't set up on this server." });
    expect((await call(startRoute.POST, { method: "POST" })).status).toBe(409);
  });

  it("polls: 202 pending, 410 expired, 403 refused, 200 with a token", async () => {
    sso.pollAppSsoSignIn.mockResolvedValueOnce({ status: "pending" });
    let res = await call(pollRoute.POST, { method: "POST", body: { handle: "h" } });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: "pending" });

    sso.pollAppSsoSignIn.mockResolvedValueOnce({ status: "expired" });
    res = await call(pollRoute.POST, { method: "POST", body: { handle: "h" } });
    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe("expired");

    sso.pollAppSsoSignIn.mockResolvedValueOnce({ status: "done", ok: false, code: "forbidden", error: "Nope." });
    res = await call(pollRoute.POST, { method: "POST", body: { handle: "h" } });
    expect(res.status).toBe(403);

    sso.pollAppSsoSignIn.mockResolvedValueOnce({ status: "done", ok: true, user: userRow(MEMBER_ID, "member"), deviceName: "Mac" });
    res = await call(pollRoute.POST, { method: "POST", body: { handle: "h" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ token: "mqt_" + "n".repeat(43), user: { id: MEMBER_ID } });
  });

  it("needs a handle", async () => {
    expect((await call(pollRoute.POST, { method: "POST", body: {} })).status).toBe(400);
    expect(sso.pollAppSsoSignIn).not.toHaveBeenCalled();
  });

  it("links only for a signed-in account", async () => {
    expect((await call(linkStartRoute.POST, { method: "POST" })).status).toBe(401);
    sso.startAppSsoLink.mockResolvedValue({ ok: true, handle: "h", authUrl: "https://m/login/sso/app?key=k", expiresAt: new Date() });
    expect((await call(linkStartRoute.POST, { method: "POST", token: MEMBER })).status).toBe(200);
    expect(sso.startAppSsoLink).toHaveBeenCalledWith(expect.objectContaining({ id: MEMBER_ID }), null);
  });
});

describe("/auth/jellyfin/quick-connect", () => {
  it("starts and shows the code", async () => {
    media.startQuickConnect.mockResolvedValue({ ok: true, handle: "h", code: "482915", expiresAt: new Date("2026-09-25T17:40:00.000Z") });
    expect(await (await call(qcStartRoute.POST, { method: "POST" })).json()).toEqual({
      handle: "h",
      code: "482915",
      expiresAt: "2026-09-25T17:40:00.000Z",
    });
    media.startQuickConnect.mockResolvedValue({ ok: false, code: "conflict", error: "Emby doesn't have Quick Connect." });
    expect((await call(qcStartRoute.POST, { method: "POST" })).status).toBe(409);
  });

  it("polls like Plex", async () => {
    media.pollQuickConnect.mockResolvedValueOnce({ status: "pending" });
    expect((await call(qcPollRoute.POST, { method: "POST", body: { handle: "h" } })).status).toBe(202);
    media.pollQuickConnect.mockResolvedValueOnce({ status: "expired" });
    expect((await call(qcPollRoute.POST, { method: "POST", body: { handle: "h" } })).status).toBe(410);
    media.pollQuickConnect.mockResolvedValueOnce({ status: "done", ok: true, user: userRow(MEMBER_ID, "member") });
    expect((await call(qcPollRoute.POST, { method: "POST", body: { handle: "h", deviceName: "PC" } })).status).toBe(200);
  });
});
