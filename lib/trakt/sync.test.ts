import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

// "Keep in sync" with a Trakt list against a real Postgres (PGlite) and the
// real request path (createRequest: permissions, request limits, one active
// request per title): only new titles are requested, each once, across a
// member's lists; a request limit leaves the rest for later; members manage
// only their own syncs. Trakt, TMDb, Sonarr/Radarr and notifications are
// mocked out.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
vi.mock("@/lib/cache/revalidate", () => ({ revalidatePathSafely: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/notifications/fan-out", () => ({ fanOut: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/bus", () => ({ publishNotification: () => undefined }));
vi.mock("@/lib/push/deliver", () => ({ pushToUser: async () => 0, pushMessageFor: () => ({}) }));
vi.mock("@/lib/requests/blocklist", () => ({
  findBlock: async (_mediaType: string, tmdbId: number) => (tmdbId === 666 ? { kind: "title" } : null),
  blockedMessage: () => "Blocked.",
}));
vi.mock("@/lib/tmdb/cache", () => ({
  getOrFetchTitle: async (mediaType: string, tmdbId: number) =>
    tmdbId === 404 ? null : { mediaType, tmdbId, name: `Title ${tmdbId}`, posterPath: null, tvdbId: null, rawTmdb: { seasons: [] } },
}));
vi.mock("@/lib/integrations/status", () => ({
  getSonarrSeasonStates: async () => null,
  getTitleLibraryStatus: async (_owner: string, _type: string, tmdbId: number) => ({
    status: tmdbId === 100 ? "owned" : "untracked",
    configured: true,
    file: null,
    provider: null,
  }),
}));
vi.mock("@/lib/arr/fourk", () => ({ isFourKReady: async () => false, getFourKStatus: async () => null }));
vi.mock("@/lib/arr/title-actions", () => ({
  addMovieToRadarrForUser: async () => ({ ok: true, placement: {} }),
  addSeriesToSonarrForUser: async () => ({ ok: true, placement: {} }),
}));
vi.mock("@/lib/integrations/library-owner", async () => {
  const { db } = await (await import("@/lib/test/pglite")).testDatabase();
  const { users } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  return {
    getLibraryOwnerUserId: async () => {
      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      return admin.id;
    },
  };
});
const settings = vi.hoisted(() => ({ clientId: "client" as string | null }));
vi.mock("@/lib/integrations/app-settings", () => ({ getTraktClientId: async () => settings.clientId }));

type Item = { type: "movie" | "show"; movie?: unknown; show?: unknown };
const trakt = vi.hoisted(() => ({
  lists: new Map<string, Item[] | Error>(),
  getTraktItems: vi.fn(),
}));
vi.mock("@/lib/trakt/client", () => ({
  getTraktItems: trakt.getTraktItems,
}));

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { notifications, requests, traktSyncItems, traktSyncs, users } from "@/lib/db/schema";
import { presetPermissions } from "@/lib/users/permissions";
import {
  createTraktSync,
  deleteTraktSync,
  listTraktSyncs,
  pendingTraktItems,
  syncAllTraktSyncs,
  syncTraktSync,
  traktListName,
  updateTraktSync,
  MAX_NEW_REQUESTS_PER_SYNC,
} from "@/lib/trakt/sync";

const movie = (tmdbId: number | null): Item => ({ type: "movie", movie: { title: `M${tmdbId}`, year: 2024, ids: { tmdb: tmdbId } } });
const show = (tmdbId: number): Item => ({ type: "show", show: { title: `S${tmdbId}`, year: 2024, ids: { tmdb: tmdbId } } });

function setList(key: string, items: Item[] | Error) {
  trakt.lists.set(key, items);
}
const LIST_URL = "https://trakt.tv/users/Someone/lists/best-of-2024";
const LIST_KEY = "list:someone/best-of-2024";
const WATCHLIST_URL = "https://trakt.tv/users/someone/watchlist";
const WATCHLIST_KEY = "watchlist:someone";

async function db() {
  return (await testDatabase()).db;
}

type Role = "admin" | "trusted" | "member";
async function addUser(username: string, role: Role, extra: Partial<typeof users.$inferInsert> = {}) {
  const [row] = await (await db())
    .insert(users)
    .values({ username, role, permissions: presetPermissions(role === "trusted" ? "trusted" : "member"), ...extra })
    .returning();
  return row;
}

async function requestedTmdbIds(userId: string) {
  const rows = await (await db()).select().from(requests).where(eq(requests.requestedByUserId, userId));
  return rows.map((r) => `${r.mediaType}:${r.tmdbId}`).sort();
}

let admin: Awaited<ReturnType<typeof addUser>>;
let anna: Awaited<ReturnType<typeof addUser>>;
let ben: Awaited<ReturnType<typeof addUser>>;

beforeEach(async () => {
  await resetTestDatabase();
  trakt.lists.clear();
  settings.clientId = "client";
  trakt.getTraktItems.mockReset();
  trakt.getTraktItems.mockImplementation(async (_config: unknown, list: { kind: string; username: string; slug?: string }) => {
    const key = list.kind === "watchlist" ? `watchlist:${list.username}` : `list:${list.username}/${list.slug}`;
    const found = trakt.lists.get(key.toLowerCase());
    if (!found) throw new Error("Trakt request failed: /users/x (404)");
    if (found instanceof Error) throw found;
    return found;
  });
  admin = await addUser("admin", "admin");
  anna = await addUser("anna", "member");
  ben = await addUser("ben", "member");
});

describe("pendingTraktItems", () => {
  it("keeps titles with a TMDb id, of a kind that's on, not handled, once each", () => {
    const items = [movie(1), movie(null), show(2), movie(1), movie(3), show(4)];
    expect(pendingTraktItems(items as never, { movies: true, tv: false }, new Set(["movie:3"]))).toEqual([
      { mediaType: "movie", tmdbId: 1, title: "M1" },
    ]);
    expect(pendingTraktItems(items as never, { movies: false, tv: true }, new Set()).map((i) => i.tmdbId)).toEqual([2, 4]);
  });

  it("names a list from its link", () => {
    expect(traktListName({ kind: "list", username: "someone", slug: "best-of-2024" })).toBe("Best of 2024");
    expect(traktListName({ kind: "watchlist", username: "someone" })).toBe("someone's watchlist");
  });
});

describe("adding a sync", () => {
  it("refuses anything but a trakt.tv list or watchlist link, without fetching it", async () => {
    for (const url of [
      "https://evil.example/users/someone/watchlist",
      "https://trakt.tv.evil.example/users/someone/watchlist",
      "http://127.0.0.1:3000/users/someone/watchlist",
      "https://trakt.tv:8443/users/someone/watchlist",
      "https://user:pass@trakt.tv/users/someone/watchlist",
      "file:///etc/passwd",
      "https://trakt.tv/users/../lists/x",
      "https://trakt.tv/movies/inception",
    ]) {
      const result = await createTraktSync(anna, { url });
      expect(result, url).toMatchObject({ ok: false, code: "invalid" });
    }
    expect(trakt.getTraktItems).not.toHaveBeenCalled();
  });

  it("needs Trakt connected and a readable list", async () => {
    settings.clientId = null;
    expect(await createTraktSync(anna, { url: LIST_URL })).toMatchObject({ ok: false, code: "conflict" });
    settings.clientId = "client";
    expect(await createTraktSync(anna, { url: LIST_URL })).toMatchObject({ ok: false, code: "upstream" });
  });

  it("without requestExisting, notes what's there now and requests only what's added later", async () => {
    setList(LIST_KEY, [movie(1), show(2)]);
    const created = await createTraktSync(anna, { url: LIST_URL });
    expect(created).toMatchObject({ ok: true, sync: { kind: "list", name: "Best of 2024", requestedCount: 0 } });
    if (!created.ok) return;
    expect(created.sync.url).toBe("https://trakt.tv/users/someone/lists/best-of-2024");

    await syncTraktSync(created.sync.id, anna.id);
    expect(await requestedTmdbIds(anna.id)).toEqual([]);

    setList(LIST_KEY, [movie(1), show(2), movie(3)]);
    await syncTraktSync(created.sync.id, anna.id);
    expect(await requestedTmdbIds(anna.id)).toEqual(["movie:3"]);

    // Idempotent: checking again files nothing new.
    await syncTraktSync(created.sync.id, anna.id);
    await syncAllTraktSyncs();
    expect(await requestedTmdbIds(anna.id)).toEqual(["movie:3"]);
    const [listed] = await listTraktSyncs({ userId: anna.id });
    expect(listed.requestedCount).toBe(1);
    expect(listed.lastError).toBeNull();
    expect(listed.lastSyncedAt).not.toBeNull();
  });

  it("with requestExisting, requests what's on it now (skipping owned and blocked titles)", async () => {
    setList(WATCHLIST_KEY, [movie(1), show(2), movie(100), movie(666), movie(404)]);
    const created = await createTraktSync(anna, { url: WATCHLIST_URL, requestExisting: true });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await syncTraktSync(created.sync.id, anna.id);
    expect(await requestedTmdbIds(anna.id)).toEqual(["movie:1", "tv:2"]);
    const items = await (await db()).select().from(traktSyncItems).where(eq(traktSyncItems.userId, anna.id));
    // Owned and blocked are noted as skipped; the one TMDb couldn't find waits.
    expect(items.map((i) => `${i.tmdbId}:${i.outcome}`).sort()).toEqual(["100:skipped", "1:requested", "2:requested", "666:skipped"]);
    // Reviewers got one alert for the batch.
    const alerts = await (await db()).select().from(notifications).where(eq(notifications.userId, admin.id));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toContain("requested 2 titles");
  });

  it("refuses the same list twice, and more than the limit", async () => {
    setList(LIST_KEY, []);
    expect((await createTraktSync(anna, { url: LIST_URL })).ok).toBe(true);
    expect(await createTraktSync(anna, { url: "https://trakt.tv/users/someone/lists/Best-Of-2024" })).toMatchObject({
      ok: false,
      code: "conflict",
    });
    // Someone else may follow the same list.
    expect((await createTraktSync(ben, { url: LIST_URL })).ok).toBe(true);
  });

  it("refuses an account that can't request anything", async () => {
    const nobody = await addUser("nobody", "member", { permissions: [] });
    setList(LIST_KEY, []);
    expect(await createTraktSync(nobody, { url: LIST_URL })).toMatchObject({ ok: false, code: "forbidden" });
  });
});

describe("checking", () => {
  it("tries each title once per member, across their lists", async () => {
    setList(LIST_KEY, []);
    setList(WATCHLIST_KEY, []);
    const a = await createTraktSync(anna, { url: LIST_URL });
    const b = await createTraktSync(anna, { url: WATCHLIST_URL });
    if (!a.ok || !b.ok) throw new Error("setup");
    setList(LIST_KEY, [movie(7)]);
    setList(WATCHLIST_KEY, [movie(7), show(8)]);
    await syncAllTraktSyncs();
    expect(await requestedTmdbIds(anna.id)).toEqual(["movie:7", "tv:8"]);

    // Declined: not asked for again, from either list.
    await (await db()).delete(requests).where(and(eq(requests.requestedByUserId, anna.id), eq(requests.tmdbId, 7)));
    await syncAllTraktSyncs();
    expect(await requestedTmdbIds(anna.id)).toEqual(["tv:8"]);
  });

  it("stops at the request limit and picks the rest up later", async () => {
    await (await db()).update(users).set({ movieQuotaLimit: 1, movieQuotaDays: 7 }).where(eq(users.id, anna.id));
    setList(LIST_KEY, []);
    const created = await createTraktSync(anna, { url: LIST_URL });
    if (!created.ok) throw new Error("setup");
    setList(LIST_KEY, [movie(11), movie(12), show(13)]);
    await syncTraktSync(created.sync.id, anna.id);
    expect(await requestedTmdbIds(anna.id)).toEqual(["movie:11", "tv:13"]);
    const [state] = await listTraktSyncs({ userId: anna.id });
    expect(state.lastError).toMatch(/request limit/);
    // Not noted as handled: tried again once there's room.
    const handled = await (await db()).select().from(traktSyncItems).where(eq(traktSyncItems.tmdbId, 12));
    expect(handled).toHaveLength(0);

    await (await db()).update(users).set({ movieQuotaLimit: null }).where(eq(users.id, anna.id));
    await syncTraktSync(created.sync.id, anna.id);
    expect(await requestedTmdbIds(anna.id)).toEqual(["movie:11", "movie:12", "tv:13"]);
  });

  it("leaves a kind the member may not request untried", async () => {
    await (await db()).update(users).set({ permissions: ["requestMovies"] }).where(eq(users.id, anna.id));
    setList(LIST_KEY, []);
    const created = await createTraktSync(anna, { url: LIST_URL });
    if (!created.ok) throw new Error("setup");
    setList(LIST_KEY, [movie(21), show(22)]);
    await syncTraktSync(created.sync.id, anna.id);
    expect(await requestedTmdbIds(anna.id)).toEqual(["movie:21"]);
    await (await db()).update(users).set({ permissions: ["requestMovies", "requestTv"] }).where(eq(users.id, anna.id));
    await syncTraktSync(created.sync.id, anna.id);
    expect(await requestedTmdbIds(anna.id)).toEqual(["movie:21", "tv:22"]);
  });

  it("requests at most a batch per check", async () => {
    setList(LIST_KEY, []);
    const created = await createTraktSync(anna, { url: LIST_URL });
    if (!created.ok) throw new Error("setup");
    setList(LIST_KEY, Array.from({ length: MAX_NEW_REQUESTS_PER_SYNC + 5 }, (_, i) => movie(1000 + i)));
    await syncTraktSync(created.sync.id, anna.id);
    expect(await requestedTmdbIds(anna.id)).toHaveLength(MAX_NEW_REQUESTS_PER_SYNC);
    await syncTraktSync(created.sync.id, anna.id);
    expect(await requestedTmdbIds(anna.id)).toHaveLength(MAX_NEW_REQUESTS_PER_SYNC + 5);
  });

  it("says why when the list can't be read", async () => {
    setList(LIST_KEY, []);
    const created = await createTraktSync(anna, { url: LIST_URL });
    if (!created.ok) throw new Error("setup");
    trakt.lists.delete(LIST_KEY);
    await syncTraktSync(created.sync.id, anna.id);
    expect((await listTraktSyncs({ userId: anna.id }))[0].lastError).toMatch(/public on Trakt/);
    setList(LIST_KEY, new Error("Trakt request failed: /users/x (503)"));
    await syncTraktSync(created.sync.id, anna.id);
    expect((await listTraktSyncs({ userId: anna.id }))[0].lastError).toMatch(/Couldn't reach Trakt/);
  });
});

describe("who manages a sync", () => {
  it("lets only its owner (or the admin) change or remove it", async () => {
    setList(LIST_KEY, []);
    const created = await createTraktSync(anna, { url: LIST_URL });
    if (!created.ok) throw new Error("setup");
    const id = created.sync.id;

    expect(await updateTraktSync(ben, id, { tv: false })).toMatchObject({ ok: false, code: "not_found" });
    expect(await deleteTraktSync(ben, id)).toMatchObject({ ok: false, code: "not_found" });
    expect(await listTraktSyncs({ userId: ben.id })).toEqual([]);

    expect(await updateTraktSync(anna, id, { tv: false })).toMatchObject({ ok: true, sync: { movies: true, tv: false } });
    expect(await updateTraktSync(anna, id, { movies: false })).toMatchObject({ ok: false, code: "invalid" });

    expect((await listTraktSyncs("all")).map((s) => s.owner.username)).toEqual(["anna"]);
    expect(await deleteTraktSync(admin, id)).toEqual({ ok: true });
    expect(await (await db()).select().from(traktSyncs)).toEqual([]);
  });
});
