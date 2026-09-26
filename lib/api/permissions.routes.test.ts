import { describe, expect, it, vi } from "vitest";

// Permissions end to end, over every real route module under app/api/v1 the
// registry says needs one: called by a member who has every other switch
// on, each answers 403 before touching anything (the database here throws
// on any use). And every admin-only route answers 403 to a member with every
// switch on — no permission reaches the admin's settings.

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: async () => null, signIn: async () => undefined, signOut: async () => undefined, handlers: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy(
    {},
    {
      get() {
        throw new Error("the database was touched");
      },
    },
  ),
}));

const who = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/lib/api/token-store", () => ({
  authenticateApiToken: async () => ({
    tokenId: "t",
    tokenName: "test",
    expiresAt: new Date("2030-01-01"),
    user: {
      id: "33333333-3333-4333-8333-333333333333",
      username: "member",
      displayName: null,
      role: "member",
      autoApproveMovies: false,
      autoApproveTv: false,
      permissions: who.permissions,
      avatarUpdatedAt: null,
      createdAt: new Date("2026-01-01"),
    },
  }),
}));

import { API_OPERATIONS } from "@/lib/api/openapi/registry";
import { API_V1_DIR, routeFileOperations } from "@/lib/api/openapi/route-files";
import { isPermission, PERMISSIONS } from "@/lib/users/permissions";

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;
const modules = import.meta.glob("/app/api/v1/**/route.ts") as Record<string, () => Promise<Record<string, Handler>>>;

const TOKEN = "mqt_" + "m".repeat(43);
const files = new Map(routeFileOperations().map((op) => [`${op.method} ${op.path}`, op.file]));

function paramsOf(path: string): Record<string, string> {
  return Object.fromEntries(
    [...path.matchAll(/\{([^}]+)\}/g)].map((m) => [
      m[1],
      m[1] === "type" ? "movie" : m[1] === "provider" ? "plex" : "1",
    ]),
  );
}

async function call(op: { method: string; path: string }) {
  const file = files.get(`${op.method} ${op.path}`);
  expect(file, `${op.method} ${op.path}`).toBeDefined();
  const relative = file!.slice(API_V1_DIR.length).replaceAll("\\", "/");
  const handler = (await modules[`/app/api/v1${relative}`]())[op.method];
  const params = paramsOf(op.path);
  const concrete = op.path.replace(/\{([^}]+)\}/g, (_, name: string) => params[name]);
  const response = await handler(
    new Request(`http://marquee.test/api/v1${concrete}`, {
      method: op.method,
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: op.method === "GET" ? undefined : "{}",
    }),
    { params: Promise.resolve(params) },
  );
  return { status: response.status, body: await response.json().catch(() => null) };
}

describe("every route that needs a permission", () => {
  const guarded = API_OPERATIONS.filter((op) => isPermission(op.auth));

  it("covers the review queue, problem reports, the blocklist and Advanced options", () => {
    expect(new Set(guarded.map((op) => op.auth))).toEqual(
      new Set(["advancedRequests", "viewRequests", "reviewRequests", "manageIssues", "manageBlocklist"]),
    );
    expect(guarded.length).toBeGreaterThanOrEqual(16);
  });

  it("refuses a member with every other switch on", async () => {
    for (const op of guarded) {
      // Reviewing requests brings seeing them along (can()).
      const without = PERMISSIONS.filter((p) => p !== op.auth && !(op.auth === "viewRequests" && p === "reviewRequests"));
      who.permissions = without;
      const response = await call(op);
      expect(response.status, `${op.method} ${op.path}: ${JSON.stringify(response.body)}`).toBe(403);
      expect(response.body.code).toBe("forbidden");
    }
  }, 60_000);

  it("lets that switch through (to the database, which isn't there)", async () => {
    for (const op of guarded) {
      who.permissions = [op.auth as string];
      const response = await call(op);
      expect(response.status, `${op.method} ${op.path}: ${JSON.stringify(response.body)}`).not.toBe(403);
    }
  }, 60_000);
});

describe("every admin-only route", () => {
  it("refuses a member with every switch on", async () => {
    const adminOnly = API_OPERATIONS.filter((op) => op.auth === "admin");
    expect(adminOnly.length).toBeGreaterThan(60);
    who.permissions = [...PERMISSIONS];
    for (const op of adminOnly) {
      const response = await call(op);
      expect(response.status, `${op.method} ${op.path}: ${JSON.stringify(response.body)}`).toBe(403);
    }
  }, 60_000);
});
