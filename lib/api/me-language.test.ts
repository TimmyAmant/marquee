import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// The account's language on the API: GET /me reports it, PATCH /me sets it
// (or clears it back to "follow the device"), and the answer — like every
// message after it — is in the account's language, else the request's
// Accept-Language, else English. Against a real Postgres (PGlite).

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
vi.mock("@/lib/integrations/library-owner", () => ({ getLibraryOwnerUserId: async () => ids.member }));

const ids = vi.hoisted(() => ({ member: "" }));
const TOKEN = "mqt_" + "l".repeat(43);
vi.mock("@/lib/api/token-store", () => ({
  // The real store joins the user row fresh on every request; so does this.
  authenticateApiToken: async (token: string) => {
    if (token !== TOKEN) return null;
    const { testDatabase } = await import("@/lib/test/pglite");
    const { users } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await (await testDatabase()).db.select().from(users).where(eq(users.id, ids.member));
    return {
      tokenId: "t",
      tokenName: "test",
      expiresAt: new Date("2030-01-01"),
      user: {
        id: row.id,
        username: row.username,
        displayName: row.displayName,
        role: row.role,
        autoApproveMovies: false,
        autoApproveTv: false,
        permissions: row.permissions,
        avatarUpdatedAt: null,
        createdAt: row.createdAt,
        language: row.language,
      },
    };
  },
  revokeApiToken: vi.fn(),
}));

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { users } from "@/lib/db/schema";
import * as meRoute from "@/app/api/v1/me/route";

async function db() {
  return (await testDatabase()).db;
}

async function call(
  handler: (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>,
  { method = "GET", headers = {}, body }: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
) {
  const response = await handler(
    new Request("http://marquee.test/api/v1/me", {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({}) },
  );
  return { status: response.status, body: await response.json() };
}

beforeEach(async () => {
  await resetTestDatabase();
  const [row] = await (await db()).insert(users).values({ username: "ana", role: "member" }).returning({ id: users.id });
  ids.member = row.id;
});

describe("the account's language on /me", () => {
  it("is null until chosen", async () => {
    const response = await call(meRoute.GET);
    expect(response.status).toBe(200);
    expect(response.body.language).toBeNull();
  });

  it("is set and cleared with PATCH /me", async () => {
    const set = await call(meRoute.PATCH, { method: "PATCH", body: { language: "pt-br" } });
    expect(set.status).toBe(200);
    expect(set.body.language).toBe("pt-BR");
    const [row] = await (await db()).select({ language: users.language }).from(users).where(eq(users.id, ids.member));
    expect(row.language).toBe("pt-BR");
    expect((await call(meRoute.GET)).body.language).toBe("pt-BR");

    const cleared = await call(meRoute.PATCH, { method: "PATCH", body: { language: null } });
    expect(cleared.body.language).toBeNull();
  });

  it("leaves it alone when the body doesn't mention it", async () => {
    await call(meRoute.PATCH, { method: "PATCH", body: { language: "de" } });
    expect((await call(meRoute.PATCH, { method: "PATCH", body: {} })).body.language).toBe("de");
  });

  it("refuses a language Marquee doesn't have, in the request's language", async () => {
    const english = await call(meRoute.PATCH, { method: "PATCH", body: { language: "tlh" } });
    expect(english).toEqual({
      status: 400,
      body: { code: "invalid", error: "language must be null or one of en, es, fr, de, pt-BR." },
    });
    const french = await call(meRoute.PATCH, { method: "PATCH", body: { language: "es-MX" }, headers: { "accept-language": "fr-FR,fr;q=0.9" } });
    expect(french.status).toBe(400);
    expect(french.body.error).toBe("language doit valoir null ou l’une de ces valeurs\u00a0: en, es, fr, de, pt-BR.");
  });

  it("answers in the account's language over the device's once chosen", async () => {
    await (await db()).update(users).set({ language: "de" }).where(eq(users.id, ids.member));
    const refused = await call(meRoute.PATCH, { method: "PATCH", body: { language: 7 }, headers: { "accept-language": "fr" } });
    expect(refused.body.error).toBe("language muss null oder einer dieser Werte sein: en, es, fr, de, pt-BR.");
  });
});
