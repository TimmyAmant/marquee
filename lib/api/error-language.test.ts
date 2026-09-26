import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// The language of the API's error messages, through the real route handlers
// against a real Postgres (PGlite): the signed-in account's choice
// (users.language), else the request's Accept-Language, else English. Both
// kinds of message: the route's own (msg(), translated when withApi writes
// the answer) and a shared core's (translated with getT() where it failed).

vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
vi.mock("@/lib/integrations/library-owner", () => ({ getLibraryOwnerUserId: async () => ids.admin }));

const ids = vi.hoisted(() => ({ admin: "" }));
const TOKEN = "mqt_" + "e".repeat(43);
vi.mock("@/lib/api/token-store", () => ({
  // The real store reads the account (and its language) fresh on every
  // request; so does this.
  authenticateApiToken: async (token: string) => {
    if (token !== TOKEN) return null;
    const { testDatabase } = await import("@/lib/test/pglite");
    const { users } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await (await testDatabase()).db.select().from(users).where(eq(users.id, ids.admin));
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
import * as loginRoute from "@/app/api/v1/auth/login/route";
import * as userRoute from "@/app/api/v1/users/[id]/route";

async function setLanguage(language: string | null) {
  await (await testDatabase()).db.update(users).set({ language }).where(eq(users.id, ids.admin));
}

async function call(
  handler: (request: Request, context: { params: Promise<never> }) => Promise<Response>,
  {
    method = "GET",
    path = "/api/v1/x",
    headers = {},
    body,
    params = {},
  }: { method?: string; path?: string; headers?: Record<string, string>; body?: unknown; params?: Record<string, string> },
) {
  const response = await handler(
    new Request(`http://marquee.test${path}`, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve(params as never) },
  );
  return { status: response.status, body: await response.json() };
}

const signedIn = { authorization: `Bearer ${TOKEN}` };

beforeEach(async () => {
  await resetTestDatabase();
  const [row] = await (await testDatabase())
    .db.insert(users)
    .values({ username: "ana", role: "admin" })
    .returning({ id: users.id });
  ids.admin = row.id;
});

describe("API error messages", () => {
  it("follow Accept-Language before anyone is signed in, English without one", async () => {
    const wrong = { username: "nobody", password: "wrong-password" };
    const english = await call(loginRoute.POST, { method: "POST", path: "/api/v1/auth/login", body: wrong });
    expect(english).toEqual({ status: 401, body: { code: "invalid_credentials", error: "Incorrect username or password" } });

    const french = await call(loginRoute.POST, {
      method: "POST",
      path: "/api/v1/auth/login",
      body: wrong,
      headers: { "accept-language": "fr-FR,fr;q=0.9" },
    });
    expect(french).toEqual({
      status: 401,
      body: { code: "invalid_credentials", error: "Nom d’utilisateur ou mot de passe incorrect" },
    });
  });

  it("are in the account's language once signed in, over the device's", async () => {
    const notFound = { method: "DELETE", headers: signedIn, params: { id: "not-a-uuid" } };
    expect((await call(userRoute.DELETE, notFound)).body).toEqual({ code: "not_found", error: "Account not found." });

    await setLanguage("fr");
    const french = await call(userRoute.DELETE, { ...notFound, headers: { ...signedIn, "accept-language": "de" } });
    expect(french).toEqual({ status: 404, body: { code: "not_found", error: "Compte introuvable." } });
  });

  it("include a shared core's failures, written in the account's language", async () => {
    await setLanguage("fr");
    const self = await call(userRoute.DELETE, { method: "DELETE", headers: signedIn, params: { id: ids.admin } });
    expect(self).toEqual({
      status: 403,
      body: { code: "forbidden", error: "Vous ne pouvez pas supprimer votre propre compte." },
    });

    await setLanguage(null);
    const english = await call(userRoute.DELETE, { method: "DELETE", headers: signedIn, params: { id: ids.admin } });
    expect(english.body.error).toBe("You can't remove your own account.");
  });
});
