import { beforeEach, describe, expect, it, vi } from "vitest";

// /api/v1/me/notification-channels, /me/notification-preferences and
// /settings/notification-events through withApi and the real bearer-token
// checks, with the channel logic mocked (lib/notifications/*.test.ts).

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";
const CHANNEL_ID = "44444444-4444-4444-8444-444444444444";

const tokens: Record<string, { id: string; role: "admin" | "member" }> = {
  ["mqt_" + "a".repeat(43)]: { id: ADMIN_ID, role: "admin" },
  ["mqt_" + "m".repeat(43)]: { id: MEMBER_ID, role: "member" },
};
vi.mock("@/lib/api/token-store", () => ({
  authenticateApiToken: async (token: string) => {
    const user = tokens[token];
    if (!user) return null;
    return {
      tokenId: "t",
      tokenName: "test",
      expiresAt: new Date("2030-01-01"),
      user: { id: user.id, username: user.role, displayName: null, role: user.role, createdAt: new Date("2026-09-01") },
    };
  },
}));
vi.mock("@/lib/integrations/library-owner", () => ({ getLibraryOwnerUserId: async () => ADMIN_ID }));

const channel = {
  id: CHANNEL_ID,
  kind: "webhook" as const,
  name: "Home automation",
  target: "hooks.example.com/••••",
  enabled: true,
  verified: true,
  lastSuccessAt: new Date("2026-09-25T10:00:00Z"),
  lastError: null,
  lastErrorAt: null,
  createdAt: new Date("2026-09-25T09:00:00Z"),
};

const personal = vi.hoisted(() => ({
  getAvailability: vi.fn(),
  listChannels: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  testChannel: vi.fn(),
  verifyChannel: vi.fn(),
  resendVerification: vi.fn(),
  startTelegramLink: vi.fn(),
  pollTelegramLink: vi.fn(),
}));
vi.mock("@/lib/notifications/personal", () => personal);

const prefs = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  savePreferences: vi.fn(),
  getHouseholdEvents: vi.fn(),
  saveHouseholdEvents: vi.fn(),
}));
vi.mock("@/lib/notifications/preferences", () => prefs);

import * as listRoute from "@/app/api/v1/me/notification-channels/route";
import * as oneRoute from "@/app/api/v1/me/notification-channels/[id]/route";
import * as testRoute from "@/app/api/v1/me/notification-channels/[id]/test/route";
import * as verifyRoute from "@/app/api/v1/me/notification-channels/[id]/verify/route";
import * as telegramPollRoute from "@/app/api/v1/me/notification-channels/telegram-link/poll/route";
import * as prefsRoute from "@/app/api/v1/me/notification-preferences/route";
import * as householdRoute from "@/app/api/v1/settings/notification-events/route";

const ADMIN = "mqt_" + "a".repeat(43);
const MEMBER = "mqt_" + "m".repeat(43);

function call(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (request: Request, context: { params: Promise<any> }) => Promise<Response>,
  { method = "GET", token, body, params = {} }: { method?: string; token?: string; body?: unknown; params?: Record<string, string> } = {},
) {
  const request = new Request("http://marquee.test/api/v1/x", {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handler(request, { params: Promise.resolve(params) });
}

beforeEach(() => {
  for (const fn of [...Object.values(personal), ...Object.values(prefs)]) fn.mockReset();
  personal.getAvailability.mockResolvedValue({
    telegram: { available: false, botUsername: null },
    pushover: { available: false },
    email: { available: true },
    discord: { available: true },
    ntfy: { available: true, householdServer: null },
    webhook: { available: true, homeNetwork: false },
  });
  personal.listChannels.mockResolvedValue([channel]);
});

describe("/me/notification-channels", () => {
  it("needs a signed-in account", async () => {
    const res = await call(listRoute.GET);
    expect(res.status).toBe(401);
  });

  it("lists only the caller's own channels, masked", async () => {
    const res = await call(listRoute.GET, { token: MEMBER });
    expect(res.status).toBe(200);
    expect(personal.listChannels).toHaveBeenCalledWith(MEMBER_ID);
    const body = await res.json();
    expect(body.channels).toEqual([
      {
        id: CHANNEL_ID,
        kind: "webhook",
        name: "Home automation",
        target: "hooks.example.com/••••",
        enabled: true,
        verified: true,
        lastSuccessAt: "2026-09-25T10:00:00.000Z",
        lastError: null,
        lastErrorAt: null,
        createdAt: "2026-09-25T09:00:00.000Z",
      },
    ]);
    expect(body.available.webhook).toEqual({ available: true, homeNetwork: false });
  });

  it("adds as the caller, whatever the body says", async () => {
    personal.createChannel.mockResolvedValue({ ok: true, channel });
    const res = await call(listRoute.POST, {
      token: MEMBER,
      method: "POST",
      body: { kind: "webhook", userId: ADMIN_ID, config: { url: "https://hooks.example.com/x" } },
    });
    expect(res.status).toBe(201);
    expect(personal.createChannel).toHaveBeenCalledWith({ id: MEMBER_ID, role: "member" }, expect.objectContaining({ kind: "webhook" }));
  });

  it("answers a failed test as 400 with the reason", async () => {
    personal.createChannel.mockResolvedValue({ ok: false, code: "invalid", error: "The test message didn't arrive: HTTP 404" });
    const res = await call(listRoute.POST, { token: MEMBER, method: "POST", body: { kind: "webhook", config: {} } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: "invalid", error: "The test message didn't arrive: HTTP 404" });
  });

  it("scopes changes, tests and codes to the caller's own channels", async () => {
    personal.updateChannel.mockResolvedValue({ ok: false, code: "not_found", error: "There's no channel with that id." });
    const patched = await call(oneRoute.PATCH, { token: MEMBER, method: "PATCH", body: { enabled: false }, params: { id: CHANNEL_ID } });
    expect(patched.status).toBe(404);
    expect(personal.updateChannel).toHaveBeenCalledWith({ id: MEMBER_ID, role: "member" }, CHANNEL_ID, { enabled: false });

    personal.deleteChannel.mockResolvedValue({ ok: false, code: "not_found", error: "There's no channel with that id." });
    const deleted = await call(oneRoute.DELETE, { token: MEMBER, method: "DELETE", params: { id: CHANNEL_ID } });
    expect(deleted.status).toBe(404);
    expect(personal.deleteChannel).toHaveBeenCalledWith(MEMBER_ID, CHANNEL_ID);

    personal.testChannel.mockResolvedValue({ ok: true, channel });
    expect((await call(testRoute.POST, { token: MEMBER, method: "POST", params: { id: CHANNEL_ID } })).status).toBe(200);
    expect(personal.testChannel).toHaveBeenCalledWith({ id: MEMBER_ID, role: "member" }, CHANNEL_ID);

    personal.verifyChannel.mockResolvedValue({ ok: false, code: "expired", error: "That code has expired. Send a new one." });
    const verified = await call(verifyRoute.POST, { token: MEMBER, method: "POST", body: { code: "123456" }, params: { id: CHANNEL_ID } });
    expect(verified.status).toBe(410);
    expect(personal.verifyChannel).toHaveBeenCalledWith(MEMBER_ID, CHANNEL_ID, "123456");
  });

  it("answers the Telegram poll 202 while waiting, 201 once connected", async () => {
    personal.pollTelegramLink.mockResolvedValueOnce({ ok: true, status: "pending" });
    const waiting = await call(telegramPollRoute.POST, { token: MEMBER, method: "POST", body: { code: "abc" } });
    expect(waiting.status).toBe(202);
    expect(await waiting.json()).toEqual({ status: "pending" });
    personal.pollTelegramLink.mockResolvedValueOnce({ ok: true, status: "connected", channel: { ...channel, kind: "telegram" } });
    const done = await call(telegramPollRoute.POST, { token: MEMBER, method: "POST", body: { code: "abc" } });
    expect(done.status).toBe(201);
    expect((await done.json()).kind).toBe("telegram");
  });
});

describe("/me/notification-preferences", () => {
  it("reads and saves the caller's own matrix", async () => {
    const rows = [{ event: "request_approved", label: "A request is approved", reviewerOnly: false, inApp: true, push: false, channels: { [CHANNEL_ID]: true } }];
    prefs.getPreferences.mockResolvedValue(rows);
    prefs.savePreferences.mockResolvedValue({ ok: true });
    const got = await call(prefsRoute.GET, { token: MEMBER });
    expect(await got.json()).toEqual({ events: rows });
    expect(prefs.getPreferences).toHaveBeenCalledWith(MEMBER_ID, "member");

    const body = { events: [{ event: "request_approved", push: false }] };
    const put = await call(prefsRoute.PUT, { token: MEMBER, method: "PUT", body });
    expect(put.status).toBe(200);
    expect(prefs.savePreferences).toHaveBeenCalledWith(MEMBER_ID, "member", body);
  });

  it("passes on a refusal", async () => {
    prefs.savePreferences.mockResolvedValue({ ok: false, code: "invalid", error: "There's no channel with that id." });
    const put = await call(prefsRoute.PUT, { token: MEMBER, method: "PUT", body: { events: [] } });
    expect(put.status).toBe(400);
  });
});

describe("/settings/notification-events", () => {
  it("is the admin's", async () => {
    expect((await call(householdRoute.GET, { token: MEMBER })).status).toBe(403);
    expect((await call(householdRoute.PUT, { token: MEMBER, method: "PUT", body: { events: {} } })).status).toBe(403);
    expect(prefs.saveHouseholdEvents).not.toHaveBeenCalled();

    prefs.getHouseholdEvents.mockResolvedValue([{ event: "request_approved", label: "A request is approved", enabled: true }]);
    prefs.saveHouseholdEvents.mockResolvedValue({ ok: true });
    const put = await call(householdRoute.PUT, { token: ADMIN, method: "PUT", body: { events: { request_approved: true } } });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ events: [{ event: "request_approved", label: "A request is approved", enabled: true }] });
  });
});
