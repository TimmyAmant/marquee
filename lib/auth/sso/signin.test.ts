import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeProvider, FAKE_CLIENT, FAKE_ISSUER, type FakeProvider } from "./testing/fake-oidc-provider";

// Single sign-on end to end — start, the provider's redirect back, and
// which account that becomes — against the fake OpenID provider (served
// through a stubbed global fetch, so discovery and the JWKS go through the
// real code), with the database replaced by a small in-memory users table.

type Row = Record<string, unknown>;
type Cond =
  | { op: "eq"; col: string; val: unknown }
  | { op: "and"; conds: Cond[] }
  | { op: "isNull"; col: string }
  | { op: "lowerEq"; col: string; val: string };

const tables: { users: Row[] } = { users: [] };
let nextId = 1;

vi.mock("drizzle-orm", () => ({
  eq: (col: string, val: unknown) => ({ op: "eq", col, val }),
  and: (...conds: Cond[]) => ({ op: "and", conds }),
  isNull: (col: string) => ({ op: "isNull", col }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("lower(")) return { op: "lowerEq", col: values[0], val: values[1] };
    return { op: "notNull", col: values[0] };
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users: Object.assign(
    Object.fromEntries(
      ["id", "username", "displayName", "passwordHash", "role", "ssoIssuer", "ssoSubject"].map((c) => [c, `users.${c}`]),
    ),
    { __name: "users" },
  ),
}));

const key = (col: string) => col.split(".")[1];
function matches(row: Row, cond: Cond | undefined): boolean {
  if (!cond) return true;
  if (cond.op === "eq") return row[key(cond.col)] === cond.val;
  if (cond.op === "isNull") return row[key(cond.col)] == null;
  if (cond.op === "lowerEq") return String(row[key(cond.col)]).toLowerCase() === cond.val;
  return cond.conds.every((c) => matches(row, c));
}
type Field = string | { op: "notNull"; col: string };
function project(row: Row, fields?: Record<string, Field>): Row {
  if (!fields) return { ...row };
  return Object.fromEntries(
    Object.entries(fields).map(([alias, col]) => [alias, typeof col === "string" ? row[key(col)] : row[key(col.col)] != null]),
  );
}

vi.mock("@/lib/db/client", () => {
  const select = (fields?: Record<string, Field>) => ({
    from: () => {
      let cond: Cond | undefined;
      const run = () => tables.users.filter((r) => matches(r, cond)).map((r) => project(r, fields));
      const query = {
        where: (c: Cond) => {
          cond = c;
          return query;
        },
        limit: async (n: number) => run().slice(0, n),
        then: (resolve: (rows: Row[]) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
      };
      return query;
    },
  });
  const insert = () => ({
    values: (values: Row) => ({
      onConflictDoNothing: () => ({
        returning: async () => {
          const clash = tables.users.some(
            (r) =>
              String(r.username).toLowerCase() === String(values.username).toLowerCase() ||
              (values.ssoSubject != null && r.ssoIssuer === values.ssoIssuer && r.ssoSubject === values.ssoSubject),
          );
          if (clash) return [];
          const row = { id: `user-${nextId++}`, role: "member", passwordHash: null, ssoIssuer: null, ssoSubject: null, ...values };
          tables.users.push(row);
          return [{ ...row }];
        },
      }),
    }),
  });
  const update = () => ({
    set: (values: Row) => ({
      where: (cond: Cond) => {
        const apply = () => {
          const hit = tables.users.filter((r) => matches(r, cond));
          for (const r of hit) Object.assign(r, values);
          return hit.map((r) => ({ ...r }));
        };
        return {
          returning: async () => apply(),
          then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(apply()).then(resolve, reject),
        };
      },
    }),
  });
  return { db: { select, insert, update } };
});

const config = vi.hoisted(() => ({
  current: null as null | Record<string, unknown>,
}));
vi.mock("@/lib/auth/sso/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/sso/config")>()),
  getSsoConfig: async () => config.current,
}));
vi.mock("@/lib/auth/media-signin", () => ({
  getLinkState: async (userId: string) => {
    const row = tables.users.find((r) => r.id === userId);
    return row
      ? { linked: { plex: false, jellyfin: false, sso: row.ssoSubject != null }, hasPassword: row.passwordHash != null }
      : null;
  },
}));

import { resetSsoFlows } from "./flows";
import {
  completeSsoCallback,
  continueAppFlow,
  pollAppSsoLink,
  pollAppSsoSignIn,
  startAppSsoLink,
  startAppSsoSignIn,
  startWebSsoLink,
  startWebSsoSignIn,
  unlinkSso,
} from "./signin";

let idp: FakeProvider;
let ipCounter = 0;
const freshIp = () => `10.1.0.${++ipCounter}`;

beforeEach(async () => {
  idp = await createFakeProvider();
  vi.stubGlobal("fetch", idp.fetch);
  globalThis.__marqueeSsoDiscovery = undefined;
  globalThis.__marqueeOidcJwks?.clear();
  resetSsoFlows();
  nextId = 1;
  tables.users = [
    { id: "admin", username: "tim@example.com", role: "admin", passwordHash: "h", ssoIssuer: null, ssoSubject: null },
    { id: "anna", username: "anna@example.com", role: "member", passwordHash: "h", ssoIssuer: null, ssoSubject: null },
    { id: "linked", username: "bob", role: "member", passwordHash: null, ssoIssuer: FAKE_ISSUER, ssoSubject: "bob-sub" },
  ];
  config.current = {
    name: "Authentik",
    issuer: FAKE_ISSUER,
    clientId: FAKE_CLIENT.clientId,
    clientSecret: FAKE_CLIENT.clientSecret,
    scopes: "openid profile email",
    publicUrl: "https://marquee.example.com",
    allowSignup: false,
    matchEmail: false,
    requiredGroup: null,
    trustedGroup: null,
    groupsClaim: "groups",
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The login page's button → the provider (as `claims`) → the callback. */
async function webSignIn(claims: Record<string, unknown>, options: { cookie?: string; error?: string } = {}) {
  const ip = freshIp();
  const started = await startWebSsoSignIn(ip, true);
  if (!started.ok) throw new Error(started.error);
  const back = idp.authorize(started.flow.authUrl, claims);
  expect(back.redirect.href.startsWith("https://marquee.example.com/api/auth/sso/callback?")).toBe(true);
  return completeSsoCallback({
    state: back.state,
    code: options.error ? null : back.code,
    error: options.error ?? null,
    cookie: options.cookie ?? started.binding,
    ip,
    sessionUserId: null,
  });
}

describe("website sign-in", () => {
  it("signs in the linked account", async () => {
    expect(await webSignIn({ sub: "bob-sub" })).toEqual({ kind: "web_sign_in", ok: true, userId: "linked", remember: true });
  });

  it("refuses someone without an account while new accounts are off", async () => {
    expect(await webSignIn({ sub: "stranger", preferred_username: "stranger" })).toEqual({
      kind: "web_sign_in",
      ok: false,
      code: "no_account",
    });
    expect(tables.users).toHaveLength(3);
  });

  it("makes a linked member account while new accounts are on", async () => {
    config.current!.allowSignup = true;
    const outcome = await webSignIn({ sub: "new-sub", preferred_username: "bob", name: "Bobby" });
    expect(outcome).toMatchObject({ ok: true });
    const created = tables.users.find((u) => u.ssoSubject === "new-sub")!;
    // "bob" is taken: a number is added.
    expect(created).toMatchObject({ username: "bob2", role: "member", ssoIssuer: FAKE_ISSUER, passwordHash: null, displayName: "Bobby" });
  });

  it("keeps people outside the required group out, even when linked", async () => {
    config.current!.requiredGroup = "marquee";
    expect(await webSignIn({ sub: "bob-sub", groups: ["family"] })).toMatchObject({ ok: false, code: "not_allowed" });
    expect(await webSignIn({ sub: "bob-sub", groups: ["marquee"] })).toMatchObject({ ok: true, userId: "linked" });
  });

  it("reads groups from userinfo when the ID token has none", async () => {
    config.current!.requiredGroup = "marquee";
    idp.userinfo = { sub: "bob-sub", groups: ["marquee"] };
    expect(await webSignIn({ sub: "bob-sub" })).toMatchObject({ ok: true, userId: "linked" });
  });

  it("makes members of the trusted group trusted — never admin", async () => {
    config.current!.trustedGroup = "trusted";
    config.current!.allowSignup = true;
    await webSignIn({ sub: "bob-sub", groups: ["trusted"] });
    expect(tables.users.find((u) => u.id === "linked")?.role).toBe("trusted");
    await webSignIn({ sub: "carol", preferred_username: "carol", groups: ["trusted"] });
    expect(tables.users.find((u) => u.ssoSubject === "carol")?.role).toBe("trusted");

    tables.users[0].ssoIssuer = FAKE_ISSUER;
    tables.users[0].ssoSubject = "tim-sub";
    await webSignIn({ sub: "tim-sub", groups: ["trusted", "admins"] });
    expect(tables.users[0].role).toBe("admin");
  });

  describe("matching by email", () => {
    beforeEach(() => {
      config.current!.matchEmail = true;
    });

    it("links the account named after a verified email", async () => {
      expect(await webSignIn({ sub: "anna-sub", email: "Anna@Example.com", email_verified: true })).toMatchObject({
        ok: true,
        userId: "anna",
      });
      expect(tables.users.find((u) => u.id === "anna")).toMatchObject({ ssoIssuer: FAKE_ISSUER, ssoSubject: "anna-sub" });
    });

    it("never on an unverified email", async () => {
      expect(await webSignIn({ sub: "anna-sub", email: "anna@example.com" })).toMatchObject({ ok: false, code: "no_account" });
      expect(await webSignIn({ sub: "anna-sub", email: "anna@example.com", email_verified: false })).toMatchObject({ ok: false });
      expect(tables.users.find((u) => u.id === "anna")?.ssoSubject).toBeNull();
    });

    it("never the admin", async () => {
      expect(await webSignIn({ sub: "evil", email: "tim@example.com", email_verified: true })).toMatchObject({
        ok: false,
        code: "no_account",
      });
      expect(tables.users[0].ssoSubject).toBeNull();
    });

    it("never an account already linked to someone else", async () => {
      tables.users[1].ssoIssuer = FAKE_ISSUER;
      tables.users[1].ssoSubject = "real-anna";
      expect(await webSignIn({ sub: "fake-anna", email: "anna@example.com", email_verified: true })).toMatchObject({ ok: false });
      expect(tables.users[1].ssoSubject).toBe("real-anna");
    });
  });

  it("refuses a callback from another browser, leaving the flow for its owner", async () => {
    const ip = freshIp();
    const started = await startWebSsoSignIn(ip, false);
    if (!started.ok) throw new Error(started.error);
    const back = idp.authorize(started.flow.authUrl, { sub: "bob-sub" });
    const input = { state: back.state, code: back.code, error: null, ip, sessionUserId: null };
    expect(await completeSsoCallback({ ...input, cookie: "attacker" })).toEqual({ kind: "unknown", ok: false, code: "expired" });
    expect(await completeSsoCallback({ ...input, cookie: null })).toMatchObject({ ok: false, code: "expired" });
    expect(await completeSsoCallback({ ...input, cookie: started.binding })).toMatchObject({ ok: true, userId: "linked" });
    // And only once.
    expect(await completeSsoCallback({ ...input, cookie: started.binding })).toMatchObject({ ok: false, code: "expired" });
  });

  it("fails on a forged ID token", async () => {
    const { generateKeyPair } = await import("jose");
    idp.foreignKey = (await generateKeyPair("RS256")).privateKey;
    expect(await webSignIn({ sub: "bob-sub" })).toMatchObject({ ok: false, code: "failed" });
  });

  it("fails when the provider says the client secret is wrong", async () => {
    config.current!.clientSecret = "rotated";
    expect(await webSignIn({ sub: "bob-sub" })).toMatchObject({ ok: false, code: "failed" });
  });

  it("reports a cancel at the provider", async () => {
    expect(await webSignIn({ sub: "bob-sub" }, { error: "access_denied" })).toMatchObject({ ok: false, code: "cancelled" });
  });

  it("refuses a flow started against settings that have since changed", async () => {
    const ip = freshIp();
    const started = await startWebSsoSignIn(ip, false);
    if (!started.ok) throw new Error(started.error);
    const back = idp.authorize(started.flow.authUrl, { sub: "bob-sub" });
    config.current = { ...config.current!, clientId: "another-client" };
    expect(
      await completeSsoCallback({ state: back.state, code: back.code, error: null, cookie: started.binding, ip, sessionUserId: null }),
    ).toMatchObject({ ok: false, code: "not_configured" });
  });

  it("needs SSO set up", async () => {
    config.current = null;
    expect(await startWebSsoSignIn(freshIp(), false)).toMatchObject({ ok: false, code: "conflict" });
  });
});

describe("website linking", () => {
  async function webLink(userId: string, sessionUserId: string | null, claims: Record<string, unknown>) {
    const ip = freshIp();
    const started = await startWebSsoLink(userId, ip);
    if (!started.ok) throw new Error(started.error);
    const back = idp.authorize(started.flow.authUrl, claims);
    return completeSsoCallback({ state: back.state, code: back.code, error: null, cookie: started.binding, ip, sessionUserId });
  }

  it("links the signed-in account", async () => {
    expect(await webLink("anna", "anna", { sub: "anna-sub" })).toEqual({ kind: "web_link", ok: true });
    expect(tables.users[1]).toMatchObject({ ssoIssuer: FAKE_ISSUER, ssoSubject: "anna-sub" });
  });

  it("only while the browser is still signed in as that account", async () => {
    expect(await webLink("anna", "admin", { sub: "anna-sub" })).toMatchObject({ ok: false, code: "wrong_account" });
    expect(await webLink("anna", null, { sub: "anna-sub" })).toMatchObject({ ok: false, code: "wrong_account" });
    expect(tables.users[1].ssoSubject).toBeNull();
  });

  it("refuses an identity linked to someone else", async () => {
    expect(await webLink("anna", "anna", { sub: "bob-sub" })).toMatchObject({ ok: false, code: "linked_elsewhere" });
  });

  it("refuses an identity outside the required group", async () => {
    config.current!.requiredGroup = "marquee";
    expect(await webLink("anna", "anna", { sub: "anna-sub" })).toMatchObject({ ok: false, code: "not_allowed" });
  });
});

describe("app sign-in and linking", () => {
  it("goes through the page's Continue, then hands the app its account exactly once", async () => {
    const ip = freshIp();
    const started = await startAppSsoSignIn(ip, "Anna's Mac");
    if (!started.ok) throw new Error(started.error);
    const pageUrl = new URL(started.authUrl);
    expect(pageUrl.origin + pageUrl.pathname).toBe("https://marquee.example.com/login/sso/app");
    // The app's link names neither the provider's state nor the poll handle.
    expect(started.authUrl).not.toContain(started.handle);

    expect(await pollAppSsoSignIn(started.handle, ip)).toEqual({ status: "pending" });
    const continued = continueAppFlow(pageUrl.searchParams.get("key"))!;
    const back = idp.authorize(continued.authUrl, { sub: "bob-sub" });
    expect(
      await completeSsoCallback({ state: back.state, code: back.code, error: null, cookie: continued.binding, ip, sessionUserId: null }),
    ).toEqual({ kind: "app_sign_in", ok: true });

    const done = await pollAppSsoSignIn(started.handle, ip);
    expect(done).toMatchObject({ status: "done", ok: true, user: { id: "linked" }, deviceName: "Anna's Mac" });
    expect(await pollAppSsoSignIn(started.handle, ip)).toEqual({ status: "expired" });
  });

  it("tells the app why not", async () => {
    const ip = freshIp();
    const started = await startAppSsoSignIn(ip, null);
    if (!started.ok) throw new Error(started.error);
    const continued = continueAppFlow(new URL(started.authUrl).searchParams.get("key"))!;
    const back = idp.authorize(continued.authUrl, { sub: "nobody" });
    await completeSsoCallback({ state: back.state, code: back.code, error: null, cookie: continued.binding, ip, sessionUserId: null });
    expect(await pollAppSsoSignIn(started.handle, ip)).toMatchObject({
      status: "done",
      ok: false,
      code: "forbidden",
      error: "There's no Marquee account for this Authentik account yet. Ask the admin to add you.",
    });
  });

  it("links for the account that started it", async () => {
    const ip = freshIp();
    const started = await startAppSsoLink({ id: "anna", username: "anna@example.com" }, ip);
    if (!started.ok) throw new Error(started.error);
    const continued = continueAppFlow(new URL(started.authUrl).searchParams.get("key"))!;
    const back = idp.authorize(continued.authUrl, { sub: "anna-sub" });
    await completeSsoCallback({ state: back.state, code: back.code, error: null, cookie: continued.binding, ip, sessionUserId: null });
    expect(await pollAppSsoLink("admin", started.handle, ip)).toEqual({ status: "expired" });
    expect(await pollAppSsoLink("anna", started.handle, ip)).toEqual({ status: "done", ok: true });
    expect(tables.users[1].ssoSubject).toBe("anna-sub");
  });
});

describe("unlinkSso", () => {
  it("won't leave an account with no way in", async () => {
    expect(await unlinkSso("linked")).toMatchObject({ ok: false, code: "conflict" });
    tables.users[2].passwordHash = "set";
    expect(await unlinkSso("linked")).toEqual({ ok: true });
    expect(tables.users[2]).toMatchObject({ ssoIssuer: null, ssoSubject: null });
  });
});
