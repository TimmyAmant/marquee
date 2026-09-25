import { beforeEach, describe, expect, it, vi } from "vitest";

// The Plex sign-in flow end to end, with plex.tv and the database stubbed:
// a tiny in-memory table store stands in for drizzle (conditions come
// through the mocked eq/and/isNull as plain objects), and plex.tv answers
// from `plexTv` below.

type Row = Record<string, unknown>;
type Cond = { op: "eq"; col: string; val: unknown } | { op: "and"; conds: Cond[] } | { op: "isNull"; col: string };

const tables: Record<string, Row[]> = { users: [], plexServers: [], appSettings: [] };
let nextId = 1;

vi.mock("drizzle-orm", () => ({
  eq: (col: string, val: unknown) => ({ op: "eq", col, val }),
  and: (...conds: Cond[]) => ({ op: "and", conds }),
  isNull: (col: string) => ({ op: "isNull", col }),
  sql: () => ({ op: "sql" }),
}));

vi.mock("@/lib/db/schema", () => {
  const table = (name: string, cols: string[]) =>
    Object.assign(Object.fromEntries(cols.map((c) => [c, `${name}.${c}`])), { __name: name });
  return {
    users: table("users", ["id", "username", "displayName", "passwordHash", "role", "plexUserId", "jellyfinUserId"]),
    plexServers: table("plexServers", ["userId", "machineIdentifier"]),
    appSettings: table("appSettings", ["id", "mediaServerSignup"]),
  };
});

function matches(row: Row, cond: Cond | undefined): boolean {
  if (!cond) return true;
  const key = (col: string) => col.split(".")[1];
  if (cond.op === "eq") return row[key(cond.col)] === cond.val;
  if (cond.op === "isNull") return row[key(cond.col)] == null;
  return cond.conds.every((c) => matches(row, c));
}

function project(row: Row, fields?: Record<string, string>): Row {
  if (!fields) return { ...row };
  return Object.fromEntries(Object.entries(fields).map(([alias, col]) => [alias, row[col.split(".")[1]]]));
}

vi.mock("@/lib/db/client", () => {
  const select = (fields?: Record<string, string>) => ({
    from: (table: { __name: string }) => {
      let cond: Cond | undefined;
      const run = () => tables[table.__name].filter((r) => matches(r, cond)).map((r) => project(r, fields));
      const query = {
        where: (c: Cond) => {
          cond = c;
          return query;
        },
        limit: async (n: number) => run().slice(0, n),
        then: (resolve: (rows: Row[]) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(run()).then(resolve, reject),
      };
      return query;
    },
  });
  const insert = (table: { __name: string }) => ({
    values: (values: Row) => ({
      onConflictDoNothing: () => ({
        returning: async () => {
          const rows = tables[table.__name];
          const unique = ["username", "plexUserId", "jellyfinUserId"];
          if (rows.some((r) => unique.some((k) => values[k] != null && r[k] === values[k]))) return [];
          const row = { id: `user-${nextId++}`, role: "member", passwordHash: null, plexUserId: null, jellyfinUserId: null, ...values };
          rows.push(row);
          return [row];
        },
      }),
    }),
  });
  const update = (table: { __name: string }) => ({
    set: (values: Row) => ({
      where: (cond: Cond) => ({
        returning: async () => {
          const hit = tables[table.__name].filter((r) => matches(r, cond));
          for (const r of hit) Object.assign(r, values);
          return hit.map((r) => ({ ...r }));
        },
      }),
    }),
  });
  return { db: { select, insert, update } };
});

vi.mock("@/lib/auth/get-admin", () => ({ getAdminUserId: async () => "admin" }));
vi.mock("@/lib/integrations/credentials", () => ({
  getPlexCredential: async (userId: string) =>
    userId === "admin" ? { authToken: "admin-token", clientId: "instance-client-id" } : null,
  getJellyfinCredential: async () => null,
}));

// What plex.tv says about the PIN and about whoever approved it.
const plexTv = {
  authToken: null as string | null,
  account: { id: 1111, username: "friendly", title: "Friend" } as Record<string, unknown>,
  /** The account behind the admin's integration token ("admin-token"). */
  adminAccount: { id: 7777, username: "tim", title: "Tim" } as Record<string, unknown>,
  resources: [] as { clientIdentifier: string; provides: string; owned?: boolean }[],
};
const checkPin = vi.fn(async () => ({ id: 99, code: "code", authToken: plexTv.authToken }));
vi.mock("@/lib/plex/client", () => ({
  plexHeaders: () => ({}),
  createPin: async () => ({ id: 99, code: "abcdefghijklmnopqrstuvwxy", authToken: null }),
  checkPin: () => checkPin(),
  buildPlexAuthUrl: (clientId: string, code: string) => `https://app.plex.tv/auth#?clientID=${clientId}&code=${code}`,
}));
vi.mock("@/lib/plex/accounts", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/plex/accounts")>();
  return {
    ...original,
    getPlexAccount: async (_clientId: string, token: string) =>
      original.parsePlexAccount(token === "admin-token" ? plexTv.adminAccount : plexTv.account),
    getServerResources: async () => plexTv.resources,
  };
});

import { pollPlexLink, pollPlexSignIn, startPlexLink, startPlexSignIn } from "./media-signin";

let ipCounter = 0;
/** A fresh client address per test, so rate-limit buckets never carry over. */
function freshIp() {
  return `10.0.0.${++ipCounter}`;
}

async function startedHandle(ip: string) {
  const started = await startPlexSignIn(ip);
  if (!started.ok) throw new Error(started.error);
  return started.handle;
}

/** Polls until the PIN check isn't throttled (at most one plex.tv check a
 * second per handle). */
async function pollNow(handle: string, ip: string) {
  vi.setSystemTime(Date.now() + 2500);
  return pollPlexSignIn(handle, ip);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  tables.users = [
    { id: "admin", username: "tester", displayName: null, passwordHash: "hash", role: "admin", plexUserId: null, jellyfinUserId: null },
  ];
  tables.plexServers = [{ userId: "admin", machineIdentifier: "admin-server" }];
  tables.appSettings = [];
  plexTv.authToken = null;
  plexTv.account = { id: 1111, username: "friendly", title: "Friend" };
  plexTv.resources = [{ clientIdentifier: "admin-server", provides: "server", owned: false }];
  checkPin.mockClear();
});

describe("Plex sign-in", () => {
  it("starts with a random handle and a plex.tv URL for this instance's client id", async () => {
    const started = await startPlexSignIn(freshIp());
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.handle).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(started.authUrl).toBe("https://app.plex.tv/auth#?clientID=instance-client-id&code=abcdefghijklmnopqrstuvwxy");
    expect(started.expiresAt.getTime() - Date.now()).toBe(10 * 60 * 1000);
  });

  it("isn't offered without a synced Plex server", async () => {
    tables.plexServers = [];
    const started = await startPlexSignIn(freshIp());
    expect(started).toMatchObject({ ok: false, code: "conflict" });
  });

  it("stays pending until plex.tv has a token", async () => {
    const ip = freshIp();
    const handle = await startedHandle(ip);
    expect(await pollNow(handle, ip)).toEqual({ status: "pending" });
  });

  it("doesn't ask plex.tv again within a second", async () => {
    const ip = freshIp();
    const handle = await startedHandle(ip);
    await pollNow(handle, ip);
    await pollPlexSignIn(handle, ip);
    expect(checkPin).toHaveBeenCalledTimes(1);
  });

  it("answers expired for an unknown handle", async () => {
    expect(await pollPlexSignIn("made-up", freshIp())).toEqual({ status: "expired" });
  });

  it("refuses a newcomer by default: new accounts from sign-in start off", async () => {
    const ip = freshIp();
    plexTv.authToken = "member-token";
    const result = await pollNow(await startedHandle(ip), ip);
    expect(result).toMatchObject({ status: "done", ok: false, code: "forbidden", error: "Ask the admin to add you first." });
    expect(tables.users).toHaveLength(1);
  });

  it("creates a member for a new Plex friend, then signs the same person in again", async () => {
    const ip = freshIp();
    tables.appSettings = [{ id: "s", mediaServerSignup: true }];
    plexTv.authToken = "member-token";
    const first = await pollNow(await startedHandle(ip), ip);
    expect(first).toMatchObject({ status: "done", ok: true });
    const created = tables.users.find((u) => u.plexUserId === "1111");
    expect(created).toMatchObject({ username: "friendly", displayName: "Friend", role: "member", passwordHash: null });

    const second = await pollNow(await startedHandle(ip), ip);
    expect(second).toMatchObject({ status: "done", ok: true, user: { id: created!.id } });
    expect(tables.users).toHaveLength(2);
  });

  it("uses a handle once: after success it's expired", async () => {
    const ip = freshIp();
    tables.appSettings = [{ id: "s", mediaServerSignup: true }];
    plexTv.authToken = "member-token";
    const handle = await startedHandle(ip);
    expect(await pollNow(handle, ip)).toMatchObject({ status: "done", ok: true });
    expect(await pollNow(handle, ip)).toEqual({ status: "expired" });
  });

  it("never matches an existing account by username", async () => {
    const ip = freshIp();
    tables.appSettings = [{ id: "s", mediaServerSignup: true }];
    plexTv.authToken = "member-token";
    plexTv.account = { id: 2222, username: "tester", title: "Not the admin" };
    const result = await pollNow(await startedHandle(ip), ip);
    expect(result).toMatchObject({ status: "done", ok: true });
    if (result.status !== "done" || !result.ok) return;
    expect(result.user.id).not.toBe("admin");
    expect(result.user.username).toBe("tester2");
    expect(tables.users.find((u) => u.id === "admin")?.plexUserId).toBeNull();
  });

  it("refuses a Plex account without access to the admin's server", async () => {
    const ip = freshIp();
    plexTv.authToken = "member-token";
    plexTv.resources = [{ clientIdentifier: "another-server", provides: "server", owned: true }];
    expect(await pollNow(await startedHandle(ip), ip)).toMatchObject({
      status: "done",
      ok: false,
      code: "forbidden",
      error: "This Plex account doesn't have access to this server.",
    });
    expect(tables.users).toHaveLength(1);
  });

  it("refuses newcomers when new accounts are off", async () => {
    const ip = freshIp();
    tables.appSettings = [{ id: "s", mediaServerSignup: false }];
    plexTv.authToken = "member-token";
    expect(await pollNow(await startedHandle(ip), ip)).toMatchObject({
      status: "done",
      ok: false,
      code: "forbidden",
      error: "Ask the admin to add you first.",
    });
  });

  it("never makes someone admin for merely having `owned` in their own server list", async () => {
    // A server the admin's connected Plex account doesn't own any more (a
    // reconnect to another account), or a Home member seeing it as owned:
    // only the connected account's own Plex id counts.
    const ip = freshIp();
    tables.appSettings = [{ id: "s", mediaServerSignup: false }];
    plexTv.authToken = "someone-token";
    plexTv.account = { id: 4242, username: "old-owner", title: "Old Owner" };
    plexTv.resources = [{ clientIdentifier: "admin-server", provides: "server", owned: true }];
    const result = await pollNow(await startedHandle(ip), ip);
    expect(result).toMatchObject({ status: "done", ok: false, code: "forbidden" });
    expect(tables.users.find((u) => u.id === "admin")?.plexUserId ?? null).toBeNull();
  });

  it("links the server's owner to the admin account and signs in as the admin", async () => {
    const ip = freshIp();
    tables.appSettings = [{ id: "s", mediaServerSignup: false }];
    plexTv.authToken = "owner-token";
    plexTv.account = { id: 7777, username: "tim", title: "Tim" };
    plexTv.resources = [{ clientIdentifier: "admin-server", provides: "server", owned: true }];
    const result = await pollNow(await startedHandle(ip), ip);
    expect(result).toMatchObject({ status: "done", ok: true, user: { id: "admin", role: "admin" } });
    expect(tables.users.find((u) => u.id === "admin")?.plexUserId).toBe("7777");
  });
});

describe("Plex linking", () => {
  it("links the approving Plex account to the account that started it", async () => {
    const ip = freshIp();
    tables.users.push({ id: "m1", username: "member", passwordHash: "hash", role: "member", plexUserId: null, jellyfinUserId: null });
    const started = await startPlexLink("m1", ip);
    if (!started.ok) throw new Error(started.error);
    plexTv.authToken = "member-token";
    vi.setSystemTime(Date.now() + 2500);

    // Another account can't finish someone else's link, and a sign-in poll
    // can't use a link handle.
    expect(await pollPlexLink("admin", started.handle, ip)).toEqual({ status: "expired" });
    expect(await pollPlexSignIn(started.handle, ip)).toEqual({ status: "expired" });

    expect(await pollPlexLink("m1", started.handle, ip)).toMatchObject({ status: "done", ok: true });
    expect(tables.users.find((u) => u.id === "m1")?.plexUserId).toBe("1111");
  });

  it("refuses a Plex account already linked to someone else", async () => {
    const ip = freshIp();
    tables.users.push(
      { id: "m1", username: "member", passwordHash: "hash", role: "member", plexUserId: "1111", jellyfinUserId: null },
      { id: "m2", username: "other", passwordHash: "hash", role: "member", plexUserId: null, jellyfinUserId: null },
    );
    const started = await startPlexLink("m2", ip);
    if (!started.ok) throw new Error(started.error);
    plexTv.authToken = "member-token";
    vi.setSystemTime(Date.now() + 2500);
    expect(await pollPlexLink("m2", started.handle, ip)).toMatchObject({ status: "done", ok: false, code: "conflict" });
    expect(tables.users.find((u) => u.id === "m2")?.plexUserId).toBeNull();
  });
});
