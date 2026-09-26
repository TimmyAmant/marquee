import { describe, expect, it, vi } from "vitest";

// The key policy end to end, over every real route module under app/api/v1:
// each mutating handler, called with a read-only API key, answers 403
// before touching anything (the database here throws on any use), and each
// denied operation does the same for a full-access key. So a new route —
// however it validates or authorizes — can't be reached past a key's scope.

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

const scope = vi.hoisted(() => ({ current: "read" as "read" | "full" }));
vi.mock("@/lib/api/api-key-store", () => ({
  authenticateApiKey: async () => ({
    keyId: "k",
    keyName: "test",
    scope: scope.current,
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      username: "admin",
      displayName: null,
      role: "admin",
      autoApproveMovies: true,
      autoApproveTv: true,
      avatarUpdatedAt: null,
      createdAt: new Date("2026-01-01"),
    },
  }),
}));

import { apiKeyDecision } from "@/lib/api/key-policy";
import { routeFileOperations, API_V1_DIR } from "@/lib/api/openapi/route-files";

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;
const modules = import.meta.glob("/app/api/v1/**/route.ts") as Record<string, () => Promise<Record<string, Handler>>>;

const KEY = "mq_" + "k".repeat(43);

function paramsOf(path: string): Record<string, string> {
  return Object.fromEntries([...path.matchAll(/\{([^}]+)\}/g)].map((m) => [m[1], m[1] === "type" ? "movie" : "1"]));
}

async function callWithKey(op: { method: string; path: string; file: string }) {
  const relative = op.file.slice(API_V1_DIR.length).replaceAll("\\", "/");
  const load = modules[`/app/api/v1${relative}`];
  expect(load, relative).toBeDefined();
  const handler = (await load())[op.method];
  const concrete = op.path.replace(/\{[^}]+\}/g, (m) => paramsOf(m)[m.slice(1, -1)]);
  const response = await handler(
    new Request(`http://marquee.test/api/v1${concrete}`, {
      method: op.method,
      headers: { "x-api-key": KEY, "content-type": "application/json" },
      body: op.method === "GET" ? undefined : "{}",
    }),
    { params: Promise.resolve(paramsOf(op.path)) },
  );
  return { status: response.status, body: await response.json() };
}

const operations = routeFileOperations();

describe("every route module, called with an API key", () => {
  it("refuses a read-only key on every mutating handler", async () => {
    scope.current = "read";
    const mutating = operations.filter((op) => !apiKeyDecision(op.method, `/api/v1${op.path}`, "read").allowed);
    expect(mutating.length).toBeGreaterThan(80);
    for (const op of mutating) {
      const response = await callWithKey(op);
      expect(response.status, `${op.method} ${op.path}: ${JSON.stringify(response.body)}`).toBe(403);
      expect(response.body.code).toBe("forbidden");
    }
  }, 60_000);

  it("refuses a full key on every denied handler", async () => {
    scope.current = "full";
    const denied = operations.filter((op) => !apiKeyDecision(op.method, `/api/v1${op.path}`, "full").allowed);
    expect(denied.length).toBeGreaterThan(60);
    for (const op of denied) {
      const response = await callWithKey(op);
      expect(response.status, `${op.method} ${op.path}: ${JSON.stringify(response.body)}`).toBe(403);
    }
  }, 60_000);
});
