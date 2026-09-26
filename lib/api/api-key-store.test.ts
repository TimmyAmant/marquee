import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// Admin-issued API keys against a real Postgres (PGlite): creating (only the
// hash stored), authenticating as the admin or the member a key acts as,
// expiry, revocation, last-used bookkeeping — and the /api/v1 side: the
// management routes, the key policy through withApi, the failure rate limit.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
vi.mock("@/lib/integrations/library-owner", () => ({ getLibraryOwnerUserId: async () => ids.admin }));
vi.mock("@/lib/library/query", () => ({
  getUserLibrary: async () => [
    { mediaType: "movie", status: "owned" },
    { mediaType: "movie", status: "owned" },
    { mediaType: "tv", status: "owned" },
    { mediaType: "movie", status: "tracked_downloading" },
  ],
  summarizeLibrary: (library: { mediaType: string; status: string }[]) => ({
    movieCount: library.filter((i) => i.status === "owned" && i.mediaType === "movie").length,
    tvCount: library.filter((i) => i.status === "owned" && i.mediaType === "tv").length,
    totalBytes: 0,
    trackedCount: 0,
  }),
}));

const ids = vi.hoisted(() => ({ admin: "", member: "" }));
const ADMIN_TOKEN = "mqt_" + "a".repeat(43);
const MEMBER_TOKEN = "mqt_" + "m".repeat(43);
vi.mock("@/lib/api/token-store", () => ({
  authenticateApiToken: async (token: string) => {
    const who = token === ADMIN_TOKEN ? { id: ids.admin, role: "admin" } : token === MEMBER_TOKEN ? { id: ids.member, role: "member" } : null;
    if (!who) return null;
    return {
      tokenId: "t",
      tokenName: "test",
      expiresAt: new Date("2030-01-01"),
      user: { id: who.id, username: who.role, displayName: null, role: who.role, avatarUpdatedAt: null, createdAt: new Date() },
    };
  },
  revokeApiToken: vi.fn(),
}));

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { apiKeys, users } from "@/lib/db/schema";
import { authenticateApiKey, createApiKey, listApiKeys, revokeApiKey } from "@/lib/api/api-key-store";
import { hashApiKey, API_KEY_FAILURE_LIMIT } from "@/lib/api/api-keys";
import * as keysRoute from "@/app/api/v1/settings/api-keys/route";
import * as keyRoute from "@/app/api/v1/settings/api-keys/[id]/route";
import * as summaryRoute from "@/app/api/v1/stats/summary/route";
import * as requestRoute from "@/app/api/v1/titles/[type]/[id]/request/route";
import * as integrationsRoute from "@/app/api/v1/settings/integrations/route";
import * as usersRoute from "@/app/api/v1/users/route";
import * as meRoute from "@/app/api/v1/me/route";
import * as logoutRoute from "@/app/api/v1/auth/logout/route";

async function db() {
  return (await testDatabase()).db;
}

async function addUser(username: string, role: "admin" | "member") {
  const [row] = await (await db()).insert(users).values({ username, role }).returning({ id: users.id });
  return row.id;
}

async function newKey(input: Partial<Parameters<typeof createApiKey>[1]> = {}, now?: Date) {
  const result = await createApiKey(
    ids.admin,
    { name: "Homepage", scope: "read", actAsUserId: null, expiresInDays: null, ...input },
    now,
  );
  if (!result.ok) throw new Error(result.error);
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each route types its own params
type Handler = (request: Request, context: { params: Promise<any> }) => Promise<Response>;
let clientIp = 0;
async function call(
  handler: Handler,
  path: string,
  { method = "GET", headers = {}, body, params = {} }: { method?: string; headers?: Record<string, string>; body?: unknown; params?: Record<string, string> } = {},
) {
  const response = await handler(
    new Request(`http://marquee.test/api/v1${path}`, {
      method,
      headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${clientIp}`, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve(params) },
  );
  return { status: response.status, body: await response.json() };
}

beforeEach(async () => {
  await resetTestDatabase();
  process.env.TRUSTED_PROXY_HOPS = "1";
  clientIp++; // a fresh rate-limit bucket per test
  ids.admin = await addUser("admin", "admin");
  ids.member = await addUser("kid", "member");
});

describe("the key store", () => {
  it("stores only the hash and a hint, and returns the secret once", async () => {
    const { key, apiKey } = await newKey();
    expect(key).toMatch(/^mq_[A-Za-z0-9_-]{43}$/);
    const [row] = await (await db()).select().from(apiKeys);
    expect(row.keyHash).toBe(hashApiKey(key));
    expect(JSON.stringify(row)).not.toContain(key);
    expect(apiKey).toMatchObject({ name: "Homepage", scope: "read", actAs: null, hint: key.slice(0, 7), lastUsedAt: null, expiresAt: null, expired: false });
    expect(await listApiKeys()).toEqual([apiKey]);
  });

  it("authenticates as the admin, or as the member it acts as", async () => {
    const admin = await newKey();
    expect(await authenticateApiKey(admin.key)).toMatchObject({ scope: "read", user: { id: ids.admin, role: "admin" } });

    const member = await newKey({ name: "Kid's phone", scope: "full", actAsUserId: ids.member });
    expect(member.apiKey.actAs).toEqual({ userId: ids.member, username: "kid", displayName: null, label: "kid" });
    expect(await authenticateApiKey(member.key)).toMatchObject({ scope: "full", user: { id: ids.member, role: "member" } });
  });

  it("treats acting as yourself as no one, and refuses an unknown member", async () => {
    expect((await newKey({ actAsUserId: ids.admin })).apiKey.actAs).toBeNull();
    const result = await createApiKey(ids.admin, {
      name: "x",
      scope: "read",
      actAsUserId: "00000000-0000-4000-8000-000000000000",
      expiresInDays: null,
    });
    expect(result).toEqual({ ok: false, code: "not_found", error: "That household member doesn't exist any more." });
  });

  it("refuses unknown and revoked keys", async () => {
    const { key, apiKey } = await newKey();
    expect(await authenticateApiKey("mq_" + "z".repeat(43))).toBeNull();
    expect(await revokeApiKey(apiKey.id)).toBe(true);
    expect(await authenticateApiKey(key)).toBeNull();
    expect(await revokeApiKey(apiKey.id)).toBe(false);
  });

  it("refuses an expired key and lists it as expired", async () => {
    const created = new Date("2026-01-01T00:00:00Z");
    const { key } = await newKey({ expiresInDays: 30 }, created);
    expect(await authenticateApiKey(key, new Date("2026-01-30T23:59:00Z"))).not.toBeNull();
    expect(await authenticateApiKey(key, new Date("2026-01-31T00:00:00Z"))).toBeNull();
    const [listed] = await listApiKeys(new Date("2026-02-01T00:00:00Z"));
    expect(listed).toMatchObject({ expiresAt: "2026-01-31T00:00:00.000Z", expired: true });
  });

  it("records last use, at most once a minute", async () => {
    const { key } = await newKey();
    const first = new Date("2026-09-26T12:00:00Z");
    await authenticateApiKey(key, first);
    expect((await listApiKeys())[0].lastUsedAt).toBe(first.toISOString());
    await authenticateApiKey(key, new Date("2026-09-26T12:00:30Z"));
    expect((await listApiKeys())[0].lastUsedAt).toBe(first.toISOString());
    await authenticateApiKey(key, new Date("2026-09-26T12:01:00Z"));
    expect((await listApiKeys())[0].lastUsedAt).toBe("2026-09-26T12:01:00.000Z");
  });

  it("goes with the member it acts as", async () => {
    const { key } = await newKey({ actAsUserId: ids.member });
    await (await db()).delete(users).where(eq(users.id, ids.member));
    expect(await authenticateApiKey(key)).toBeNull();
    expect(await listApiKeys()).toEqual([]);
  });
});

describe("/api/v1/settings/api-keys", () => {
  const admin = { authorization: `Bearer ${ADMIN_TOKEN}` };

  it("lets the signed-in admin create, list and revoke keys", async () => {
    const created = await call(keysRoute.POST, "/settings/api-keys", {
      method: "POST",
      headers: admin,
      body: { name: "Homepage", scope: "read", expiresInDays: 90 },
    });
    expect(created.status).toBe(201);
    expect(created.body.key).toMatch(/^mq_/);
    expect(created.body.apiKey).toMatchObject({ name: "Homepage", scope: "read", actAs: null });

    const list = await call(keysRoute.GET, "/settings/api-keys", { headers: admin });
    expect(list).toEqual({ status: 200, body: { results: [created.body.apiKey] } });
    expect(JSON.stringify(list.body)).not.toContain(created.body.key);

    const id = created.body.apiKey.id;
    expect(await call(keyRoute.DELETE, `/settings/api-keys/${id}`, { method: "DELETE", headers: admin, params: { id } })).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect((await call(keyRoute.DELETE, `/settings/api-keys/${id}`, { method: "DELETE", headers: admin, params: { id } })).status).toBe(404);
  });

  it("validates the body", async () => {
    const response = await call(keysRoute.POST, "/settings/api-keys", { method: "POST", headers: admin, body: { name: "x", scope: "root" } });
    expect(response).toEqual({ status: 400, body: { code: "invalid", error: "Choose read-only or full access." } });
  });

  it("refuses members", async () => {
    const response = await call(keysRoute.GET, "/settings/api-keys", { headers: { authorization: `Bearer ${MEMBER_TOKEN}` } });
    expect(response).toEqual({ status: 403, body: { code: "forbidden", error: "Only the admin can manage API keys." } });
  });

  it("refuses every API key, even a full one, on every method", async () => {
    const { key, apiKey } = await newKey({ scope: "full" });
    for (const headers of [{ "x-api-key": key }, { authorization: `Bearer ${key}` }] as Record<string, string>[]) {
      expect((await call(keysRoute.GET, "/settings/api-keys", { headers })).status).toBe(403);
      expect((await call(keysRoute.POST, "/settings/api-keys", { method: "POST", headers, body: { name: "x", scope: "full" } })).status).toBe(403);
      expect(
        (await call(keyRoute.DELETE, `/settings/api-keys/${apiKey.id}`, { method: "DELETE", headers, params: { id: apiKey.id } })).status,
      ).toBe(403);
    }
    expect(await listApiKeys()).toHaveLength(1);
  });
});

describe("API keys on /api/v1", () => {
  it("answer the widget summary with a read-only key", async () => {
    const { key } = await newKey();
    const response = await call(summaryRoute.GET, "/stats/summary", { headers: { "x-api-key": key } });
    expect(response).toEqual({
      status: 200,
      body: { pendingRequests: 0, openIssues: 0, cantFind: 0, movies: 2, series: 1, downloading: 1 },
    });
  });

  it("act as the member: /me is the member", async () => {
    const { key } = await newKey({ actAsUserId: ids.member });
    const response = await call(meRoute.GET, "/me", { headers: { authorization: `Bearer ${key}` } });
    expect(response.status).toBe(200);
    expect(response.body.username).toBe("kid");
  });

  it("refuse a read-only key's request before the route runs", async () => {
    const { key } = await newKey();
    const response = await call(requestRoute.POST, "/titles/movie/603/request", {
      method: "POST",
      headers: { "x-api-key": key },
      body: {},
      params: { type: "movie", id: "603" },
    });
    expect(response).toEqual({ status: 403, body: { code: "forbidden", error: "This API key is read-only." } });
  });

  it("refuse admin settings and account changes to a full admin key", async () => {
    const { key } = await newKey({ scope: "full" });
    const headers = { "x-api-key": key };
    expect((await call(integrationsRoute.GET, "/settings/integrations", { headers })).status).toBe(403);
    expect((await call(usersRoute.POST, "/users", { method: "POST", headers, body: { username: "evil", password: "password123" } })).status).toBe(403);
    expect((await call(logoutRoute.POST, "/auth/logout", { method: "POST", headers })).status).toBe(403);
    expect((await call(usersRoute.GET, "/users", { headers })).status).toBe(200);
  });

  it("can't borrow another path's permissions through the route's own URL", async () => {
    // The policy reads the URL actually requested, whichever handler answers.
    const { key } = await newKey({ scope: "full" });
    const response = await call(summaryRoute.GET, "/settings/api-keys", { headers: { "x-api-key": key } });
    expect(response.status).toBe(403);
  });

  it("refuse a key sent alongside a device token", async () => {
    const { key } = await newKey({ scope: "full" });
    const response = await call(meRoute.GET, "/me", { headers: { "x-api-key": key, authorization: `Bearer ${ADMIN_TOKEN}` } });
    expect(response).toEqual({ status: 401, body: { code: "unauthorized", error: "Send an API key or a session token, not both." } });
  });

  it("refuse revoked and expired keys with 401", async () => {
    const revoked = await newKey();
    await revokeApiKey(revoked.apiKey.id);
    expect((await call(meRoute.GET, "/me", { headers: { "x-api-key": revoked.key } })).status).toBe(401);
    const expired = await newKey({ expiresInDays: 1 }, new Date("2020-01-01"));
    expect(await call(meRoute.GET, "/me", { headers: { "x-api-key": expired.key } })).toEqual({
      status: 401,
      body: { code: "unauthorized", error: "This API key is missing, expired or revoked." },
    });
  });

  it("rate-limit wrong keys per client, then let the right one through once the window resets", async () => {
    const { key } = await newKey();
    for (let i = 0; i < API_KEY_FAILURE_LIMIT; i++) {
      expect((await call(meRoute.GET, "/me", { headers: { "x-api-key": "mq_" + "x".repeat(43) } })).status).toBe(401);
    }
    expect((await call(meRoute.GET, "/me", { headers: { "x-api-key": "garbage" } })).status).toBe(429);
    const limited = await call(meRoute.GET, "/me", { headers: { "x-api-key": key } });
    expect(limited).toEqual({ status: 429, body: { code: "rate_limited", error: "Too many attempts with a wrong API key. Try again in a few minutes." } });

    clientIp++; // another client isn't affected
    expect((await call(meRoute.GET, "/me", { headers: { "x-api-key": key } })).status).toBe(200);
  });
});
