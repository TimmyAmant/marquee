import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchlistFetch, WatchlistItem } from "./watchlist-api";

// The watchlist sync with plex.tv, request creation and the database
// stubbed: a small in-memory table store stands in for drizzle.

type Row = Record<string, unknown>;
type Cond = { op: "eq"; col: string; val: unknown } | { op: "and"; conds: Cond[] } | { op: "isNotNull"; col: string };

const tables = vi.hoisted(() => ({ users: [], plexWatchlists: [], plexWatchlistItems: [] }) as Record<string, Row[]>);

vi.mock("drizzle-orm", () => ({
  eq: (col: string, val: unknown) => ({ op: "eq", col, val }),
  and: (...conds: Cond[]) => ({ op: "and", conds }),
  isNotNull: (col: string) => ({ op: "isNotNull", col }),
}));

vi.mock("@/lib/db/schema", () => {
  const table = (name: string, cols: string[]) =>
    Object.assign(Object.fromEntries(cols.map((c) => [c, `${name}.${c}`])), { __name: name });
  return {
    users: table("users", ["id", "plexUserId", "role"]),
    plexWatchlists: table("plexWatchlists", [
      "userId",
      "plexUserId",
      "authTokenEnc",
      "authTokenIv",
      "authTokenTag",
      "clientId",
      "syncMovies",
      "syncTv",
      "etag",
      "lastSyncedAt",
      "lastError",
    ]),
    plexWatchlistItems: table("plexWatchlistItems", ["userId", "mediaType", "tmdbId", "outcome", "requestId"]),
  };
});

vi.mock("@/lib/db/client", () => {
  const key = (col: string) => col.split(".")[1];
  const matches = (row: Row, cond: Cond | undefined): boolean => {
    if (!cond) return true;
    if (cond.op === "eq") return row[key(cond.col)] === cond.val;
    if (cond.op === "isNotNull") return row[key(cond.col)] != null;
    return cond.conds.every((c) => matches(row, c));
  };
  const project = (row: Row, fields?: Record<string, string>) =>
    fields ? Object.fromEntries(Object.entries(fields).map(([alias, col]) => [alias, row[key(col)]])) : { ...row };
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
      onConflictDoNothing: async () => {
        const rows = tables[table.__name];
        const same = (r: Row) => r.userId === values.userId && r.mediaType === values.mediaType && r.tmdbId === values.tmdbId;
        if (!rows.some(same)) rows.push({ ...values });
      },
      onConflictDoUpdate: async ({ set }: { set: Row }) => {
        const existing = tables[table.__name].find((r) => r.userId === values.userId);
        if (existing) Object.assign(existing, set);
        else tables[table.__name].push({ syncMovies: true, syncTv: true, lastSyncedAt: null, ...values });
      },
    }),
  });
  const update = (table: { __name: string }) => ({
    set: (values: Row) => ({
      where: async (cond: Cond) => {
        for (const r of tables[table.__name].filter((row) => matches(row, cond))) Object.assign(r, values);
      },
    }),
  });
  const del = (table: { __name: string }) => ({
    where: async (cond: Cond) => {
      tables[table.__name] = tables[table.__name].filter((r) => !matches(r, cond));
    },
  });
  return { db: { select, insert, update, delete: del } };
});

vi.mock("@/lib/crypto/encryption", () => ({
  encryptSecret: (text: string) => ({ ciphertext: `enc:${text}`, iv: "iv", tag: "tag" }),
  decryptSecret: (field: { ciphertext: string }) => field.ciphertext.replace(/^enc:/, ""),
}));
vi.mock("@/lib/integrations/library-owner", () => ({ getLibraryOwnerUserId: async () => "admin" }));

const plexTv = vi.hoisted(() => ({ answer: null as WatchlistFetch | Error | null, seenEtag: undefined as string | null | undefined }));
vi.mock("@/lib/plex/watchlist-api", () => ({
  fetchWatchlist: async (_clientId: string, token: string, etag: string | null) => {
    plexTv.seenEtag = etag;
    if (token !== "member-token") return { status: "unauthorized" };
    if (plexTv.answer instanceof Error) throw plexTv.answer;
    return plexTv.answer;
  },
}));

type CreateResult = { ok: true; requestId: string } | { ok: false; code: string; error: string };
const createRequest = vi.hoisted(() =>
  vi.fn(async (_viewer: unknown, input: { tmdbId: number }): Promise<CreateResult> => ({ ok: true, requestId: `req-${input.tmdbId}` })),
);
vi.mock("@/lib/requests/mutate", () => ({ createRequest }));

import {
  disableWatchlist,
  enableWatchlist,
  getWatchlistState,
  MAX_NEW_REQUESTS_PER_SYNC,
  pendingWatchlistItems,
  setWatchlistTypes,
  syncPlexWatchlist,
  WATCHLIST_TOKEN_REJECTED,
} from "./watchlist";

const movie = (tmdbId: number): WatchlistItem => ({ mediaType: "movie", tmdbId, title: `Movie ${tmdbId}` });
const show = (tmdbId: number): WatchlistItem => ({ mediaType: "tv", tmdbId, title: `Show ${tmdbId}` });

function outcomes() {
  return tables.plexWatchlistItems.map((r) => `${r.mediaType}:${r.tmdbId}:${r.outcome}`);
}

beforeEach(async () => {
  tables.users = [{ id: "m1", plexUserId: "1111", role: "member" }];
  tables.plexWatchlists = [];
  tables.plexWatchlistItems = [];
  plexTv.answer = { status: "ok", etag: "etag-1", items: [] };
  plexTv.seenEtag = undefined;
  createRequest.mockClear();
  createRequest.mockImplementation(async (_viewer, input) => ({ ok: true, requestId: `req-${input.tmdbId}` }));
  await enableWatchlist("m1", { plexUserId: "1111", authToken: "member-token", clientId: "client" });
});

describe("pendingWatchlistItems", () => {
  it("keeps new titles of the kinds that are on, once each", () => {
    const items = [movie(1), show(2), movie(3), movie(1)];
    expect(pendingWatchlistItems(items, { movies: true, tv: true }, new Set(["movie:3"]))).toEqual([movie(1), show(2)]);
    expect(pendingWatchlistItems(items, { movies: false, tv: true }, new Set())).toEqual([show(2)]);
  });
});

describe("the watchlist sync", () => {
  it("requests each new title as the member, and remembers it", async () => {
    plexTv.answer = { status: "ok", etag: "etag-1", items: [movie(10), show(20)] };
    expect(await syncPlexWatchlist("m1")).toEqual({ requested: 2 });
    expect(createRequest).toHaveBeenCalledWith(
      { userId: "m1", isAdmin: false, libraryOwnerId: "admin" },
      { mediaType: "movie", tmdbId: 10, title: "Movie 10", posterPath: null },
    );
    expect(outcomes()).toEqual(["movie:10:requested", "tv:20:requested"]);
    expect(tables.plexWatchlists[0]).toMatchObject({ etag: "etag-1", lastError: null });

    // The next sync asks with the ETag; an unchanged list requests nothing.
    plexTv.answer = { status: "unchanged" };
    createRequest.mockClear();
    expect(await syncPlexWatchlist("m1")).toEqual({ requested: 0 });
    expect(plexTv.seenEtag).toBe("etag-1");
    expect(createRequest).not.toHaveBeenCalled();
  });

  it("tries each title once: a declined or owned title isn't requested again", async () => {
    createRequest.mockImplementation(async () => ({ ok: false, code: "conflict", error: "You already have this in your library." }));
    plexTv.answer = { status: "ok", etag: "etag-1", items: [movie(10)] };
    await syncPlexWatchlist("m1");
    expect(outcomes()).toEqual(["movie:10:skipped"]);

    plexTv.answer = { status: "ok", etag: "etag-2", items: [movie(11), movie(10)] };
    createRequest.mockClear();
    createRequest.mockImplementation(async (_viewer, input) => ({ ok: true, requestId: `req-${input.tmdbId}` }));
    await syncPlexWatchlist("m1");
    expect(createRequest).toHaveBeenCalledTimes(1);
    expect(outcomes()).toEqual(["movie:10:skipped", "movie:11:requested"]);
  });

  it("retries titles that failed for a passing reason, and drops the ETag until they're done", async () => {
    createRequest.mockImplementation(async () => ({ ok: false, code: "upstream", error: "TMDb is down" }));
    plexTv.answer = { status: "ok", etag: "etag-1", items: [movie(10)] };
    await syncPlexWatchlist("m1");
    expect(outcomes()).toEqual([]);
    expect(tables.plexWatchlists[0].etag).toBeNull();
  });

  it("requests at most a batch per sync, and picks up the rest next time", async () => {
    const items = Array.from({ length: MAX_NEW_REQUESTS_PER_SYNC + 5 }, (_, i) => movie(i + 1));
    plexTv.answer = { status: "ok", etag: "etag-1", items };
    expect(await syncPlexWatchlist("m1")).toEqual({ requested: MAX_NEW_REQUESTS_PER_SYNC });
    expect(tables.plexWatchlists[0].etag).toBeNull();
    expect(await syncPlexWatchlist("m1")).toEqual({ requested: 5 });
    expect(tables.plexWatchlists[0].etag).toBe("etag-1");
  });

  it("only requests the kinds that are on, and rereads the list when one is turned on", async () => {
    await setWatchlistTypes("m1", { tv: false });
    plexTv.answer = { status: "ok", etag: "etag-1", items: [movie(10), show(20)] };
    await syncPlexWatchlist("m1");
    expect(outcomes()).toEqual(["movie:10:requested"]);

    await setWatchlistTypes("m1", { tv: true });
    expect(tables.plexWatchlists[0].etag).toBeNull();
    await syncPlexWatchlist("m1");
    expect(outcomes()).toEqual(["movie:10:requested", "tv:20:requested"]);
  });

  it("switches itself off, with a reason, when Plex rejects the token", async () => {
    await enableWatchlist("m1", { plexUserId: "1111", authToken: "revoked-token", clientId: "client" });
    await syncPlexWatchlist("m1");
    const state = await getWatchlistState("m1");
    expect(state).toMatchObject({ available: true, enabled: false, lastError: WATCHLIST_TOKEN_REJECTED });
    expect(tables.plexWatchlists[0].authTokenEnc).toBeNull();
  });

  it("notes when plex.tv can't be reached, and carries on next time", async () => {
    plexTv.answer = new Error("timeout");
    await syncPlexWatchlist("m1");
    expect((await getWatchlistState("m1")).lastError).toMatch(/Couldn't reach Plex/);
    plexTv.answer = { status: "ok", etag: "etag-1", items: [movie(10)] };
    await syncPlexWatchlist("m1");
    expect((await getWatchlistState("m1")).lastError).toBeNull();
  });

  it("stops using a token once a different Plex account is linked", async () => {
    tables.users[0].plexUserId = "9999";
    plexTv.answer = { status: "ok", etag: "etag-1", items: [movie(10)] };
    await syncPlexWatchlist("m1");
    expect(createRequest).not.toHaveBeenCalled();
    expect(tables.plexWatchlists).toEqual([]);
  });

  it("keeps what was handled when turned off, so declined titles don't come back", async () => {
    plexTv.answer = { status: "ok", etag: "etag-1", items: [movie(10)] };
    await syncPlexWatchlist("m1");
    await disableWatchlist("m1");
    expect(await getWatchlistState("m1")).toMatchObject({ enabled: false, requestedCount: 1 });
    await enableWatchlist("m1", { plexUserId: "1111", authToken: "member-token", clientId: "client" });
    createRequest.mockClear();
    await syncPlexWatchlist("m1");
    expect(createRequest).not.toHaveBeenCalled();
  });
});
