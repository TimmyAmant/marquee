import { beforeEach, describe, expect, it, vi } from "vitest";

// The Discover-rows and Trakt-sync endpoints end to end: route modules,
// withApi and the real token checks, the real layout and sync code on a real
// Postgres (PGlite), with TMDb and Trakt mocked. Only the admin arranges
// Discover; members manage only their own Trakt syncs; GET /discover keeps
// its fixed keys and adds `shelves` in the admin's order.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

const who = vi.hoisted(() => ({
  tokens: new Map<string, { id: string; username: string; role: string; permissions: string[] }>(),
}));
vi.mock("@/lib/api/token-store", () => ({
  authenticateApiToken: async (token: string) => {
    const user = who.tokens.get(token);
    return user
      ? {
          tokenId: "t",
          tokenName: "test",
          expiresAt: new Date("2030-01-01"),
          user: { ...user, displayName: null, autoApproveMovies: false, autoApproveTv: false, avatarUpdatedAt: null, createdAt: new Date() },
        }
      : null;
  },
}));
vi.mock("@/lib/integrations/library-owner", () => ({ getLibraryOwnerUserId: async () => null }));
// The admin's Radarr and Sonarr, fully set up (quality profile and root
// folder picked), so their Discover cards offer "+ Add".
vi.mock("@/lib/integrations/credentials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/credentials")>()),
  getArrCredential: async () => ({ baseUrl: "http://arr", apiKey: "k", qualityProfileId: 1, rootFolderPath: "/media" }),
}));
vi.mock("@/lib/integrations/app-settings", () => ({
  getTraktClientId: async () => "client",
  getTmdbAccessToken: async () => "token",
}));

const tmdbResult = (id: number) => ({ id, title: `Movie ${id}`, name: `Show ${id}`, overview: "", poster_path: null, backdrop_path: null, popularity: id });
vi.mock("@/lib/tmdb/client", () => ({
  isTmdbConfigured: async () => true,
  TmdbNotConfiguredError: class extends Error {},
  getTrendingAll: async () => ({ results: [{ ...tmdbResult(1), media_type: "movie" }] }),
  getUpcomingMovies: async () => ({ results: [] }),
  getUpcomingTv: async () => ({ results: [] }),
  discoverMovies: async () => ({ results: [tmdbResult(2)] }),
  discoverTv: async () => ({ results: [tmdbResult(3)] }),
  getMovieGenres: async () => ({ genres: [{ id: 28, name: "Action" }] }),
  getTvGenres: async () => ({ genres: [] }),
  getCompanyDetails: async (id: number) => ({ id, name: `Studio ${id}`, logo_path: null }),
  getNetworkDetails: async (id: number) => ({ id, name: `Network ${id}`, logo_path: null }),
  getKeywordDetails: async (id: number) => ({ id, name: "anime" }),
  getTmdbList: async () => ({ items: [], total_pages: 1, total_results: 0 }),
  searchKeyword: async () => ({ results: [{ id: 99, name: "anime inspired" }, { id: 210024, name: "anime" }] }),
  searchCompany: async () => ({ results: [{ id: 41077, name: "A24", logo_path: "/a24.png", origin_country: "US" }] }),
  discoverForShelf: async (type: string, filter: { keywordId?: number }) => ({
    page: 1,
    results: filter.keywordId ? [tmdbResult(type === "movie" ? 500 : 600)] : [],
    total_pages: 1,
    total_results: 1,
  }),
}));
vi.mock("@/lib/trakt/client", async () => ({
  ...(await import("@/lib/trakt/url")),
  getTraktItems: async () => [],
  getTraktItemsPage: async () => ({ items: [], pageCount: 1, itemCount: 0 }),
}));

import { eq } from "drizzle-orm";
import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { requestBlocklist, requests, users } from "@/lib/db/schema";
import { presetPermissions } from "@/lib/users/permissions";
import * as discoverRoute from "@/app/api/v1/discover/route";
import * as listRoute from "@/app/api/v1/discover/lists/[list]/route";
import * as settingsRoute from "@/app/api/v1/settings/discover/route";
import * as shelvesRoute from "@/app/api/v1/settings/discover/shelves/route";
import * as shelfRoute from "@/app/api/v1/settings/discover/shelves/[id]/route";
import * as resetRoute from "@/app/api/v1/settings/discover/reset/route";
import * as lookupRoute from "@/app/api/v1/settings/discover/lookup/route";
import * as syncsRoute from "@/app/api/v1/trakt-syncs/route";
import * as syncRoute from "@/app/api/v1/trakt-syncs/[id]/route";
import * as syncNowRoute from "@/app/api/v1/trakt-syncs/[id]/sync/route";

const ADMIN = "mqt_" + "a".repeat(43);
const ANNA = "mqt_" + "n".repeat(43);
const BEN = "mqt_" + "b".repeat(43);

type Handler = (request: Request, context: { params: Promise<never> }) => Promise<Response>;

async function call(
  handler: Handler,
  { method = "GET", token = ADMIN, body, params = {}, query = "" }: { method?: string; token?: string; body?: unknown; params?: Record<string, string>; query?: string } = {},
) {
  const request = new Request(`http://marquee.test/api/v1/x${query}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await handler(request, { params: Promise.resolve(params) as Promise<never> });
  return { status: response.status, body: await response.json() };
}

beforeEach(async () => {
  await resetTestDatabase();
  const { db } = await testDatabase();
  who.tokens.clear();
  for (const [token, username, role] of [
    [ADMIN, "admin", "admin"],
    [ANNA, "anna", "member"],
    [BEN, "ben", "member"],
  ] as const) {
    const permissions = presetPermissions("member");
    const [row] = await db.insert(users).values({ username, role, permissions }).returning({ id: users.id });
    who.tokens.set(token, { id: row.id, username, role, permissions });
  }
});

describe("Settings › Discover", () => {
  it("is the admin's alone", async () => {
    for (const [handler, method] of [
      [settingsRoute.GET, "GET"],
      [settingsRoute.PUT, "PUT"],
      [shelvesRoute.POST, "POST"],
      [resetRoute.POST, "POST"],
      [lookupRoute.GET, "GET"],
    ] as const) {
      const res = await call(handler as Handler, { method, token: ANNA, body: method === "GET" ? undefined : {} });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Only the admin can arrange Discover.");
    }
    expect((await call(shelfRoute.PATCH as Handler, { method: "PATCH", token: ANNA, params: { id: "trending" }, body: { hidden: true } })).status).toBe(403);
    expect((await call(shelfRoute.DELETE as Handler, { method: "DELETE", token: ANNA, params: { id: "trending" } })).status).toBe(403);
  });

  it("reorders, hides and adds rows, and Discover follows", async () => {
    const initial = await call(settingsRoute.GET as Handler);
    expect(initial.status).toBe(200);
    expect(initial.body.shelves).toHaveLength(10);
    expect(initial.body).toMatchObject({ traktConfigured: true, maxCustomShelves: 30 });

    const lookup = await call(lookupRoute.GET as Handler, { query: "?type=keyword&q=anime" });
    expect(lookup.body.results[0]).toEqual({ tmdbId: 210024, name: "anime", logoPath: null, detail: null });

    const added = await call(shelvesRoute.POST as Handler, { method: "POST", body: { kind: "keyword", tmdbId: 210024 } });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ kind: "keyword", title: "Anime", custom: true, hidden: false });

    const saved = await call(settingsRoute.PUT as Handler, {
      method: "PUT",
      body: { shelves: [{ id: added.body.id }, { id: "trending", hidden: true }] },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.shelves.slice(0, 2).map((s: { id: string; hidden: boolean }) => [s.id, s.hidden])).toEqual([
      [added.body.id, false],
      ["trending", true],
    ]);

    const discover = await call(discoverRoute.GET as Handler, { token: ANNA });
    expect(discover.status).toBe(200);
    // Older apps: the fixed keys stay; the hidden row is empty there.
    expect(discover.body.trending).toEqual([]);
    expect(discover.body.popularMovies).toHaveLength(1);
    expect(discover.body.seeAll.trending).toEqual({ type: "list", list: "trending", mediaType: null });
    // Newer apps: the rows in the admin's order, hidden ones left out.
    const shelves = discover.body.shelves as { id: string; kind: string; results: unknown[] | null; genres: unknown; logos: unknown; seeAll: unknown }[];
    expect(shelves[0]).toMatchObject({
      id: added.body.id,
      kind: "keyword",
      title: "Anime",
      custom: true,
      genres: null,
      logos: null,
      seeAll: { type: "list", list: added.body.id, mediaType: null },
    });
    expect(shelves[0].results).toHaveLength(2);
    expect(shelves.map((s) => s.id)).not.toContain("trending");
    expect(shelves.find((s) => s.id === "movieGenres")).toMatchObject({ results: null, genres: [{ id: 28, name: "Action" }], logos: null });
    expect(shelves.find((s) => s.id === "studios")?.logos).toEqual(expect.arrayContaining([{ tmdbId: 2, name: "Studio 2", logoPath: null }]));

    // Its See all.
    const list = await call(listRoute.GET as Handler, { token: ANNA, params: { list: added.body.id } });
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ list: added.body.id, title: "Anime", page: 1, totalPages: 1 });
    expect(list.body.results).toHaveLength(2);
    expect((await call(listRoute.GET as Handler, { token: ANNA, params: { list: "44444444-4444-4444-8444-444444444444" } })).status).toBe(404);

    // Renamed, then removed; a built-in row can only be hidden.
    const renamed = await call(shelfRoute.PATCH as Handler, { method: "PATCH", params: { id: added.body.id }, body: { title: "Anime & more" } });
    expect(renamed.body.title).toBe("Anime & more");
    expect((await call(shelfRoute.DELETE as Handler, { method: "DELETE", params: { id: "trending" } })).status).toBe(400);
    expect((await call(shelfRoute.DELETE as Handler, { method: "DELETE", params: { id: added.body.id } })).body).toEqual({ ok: true });

    const reset = await call(resetRoute.POST as Handler, { method: "POST" });
    expect(reset.body.shelves.every((s: { hidden: boolean }) => !s.hidden)).toBe(true);
  });

  it("refuses a bad row with the reason", async () => {
    const res = await call(shelvesRoute.POST as Handler, { method: "POST", body: { kind: "traktList", url: "http://169.254.169.254/latest" } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("invalid");
  });
});

describe("Discover quick actions", () => {
  // The Mac and Windows apps pick a poster's button from these three fields
  // alone (lib/api/poster-actions.ts), so every shelf must carry them.
  const actions = (card: { canQuickAdd: boolean; canRequest: boolean; requested: boolean | null }) => ({
    canQuickAdd: card.canQuickAdd,
    canRequest: card.canRequest,
    requested: card.requested,
  });

  it("offers the admin Add on every shelf, built-in and custom", async () => {
    const added = await call(shelvesRoute.POST as Handler, { method: "POST", body: { kind: "keyword", tmdbId: 210024 } });
    const discover = await call(discoverRoute.GET as Handler);
    expect(discover.status).toBe(200);
    for (const key of ["trending", "popularMovies", "popularSeries"] as const) {
      expect(actions(discover.body[key][0])).toEqual({ canQuickAdd: true, canRequest: false, requested: false });
    }
    const custom = discover.body.shelves.find((s: { id: string }) => s.id === added.body.id);
    expect(custom.results.map(actions)).toEqual([
      { canQuickAdd: true, canRequest: false, requested: false },
      { canQuickAdd: true, canRequest: false, requested: false },
    ]);
  });

  it("offers a member Request instead — not for a blocked title, and Requested once they've asked", async () => {
    const { db } = await testDatabase();
    const anna = who.tokens.get(ANNA)!;
    await db.insert(requestBlocklist).values({ kind: "title", mediaType: "movie", tmdbId: 2, title: "Movie 2" });
    await db.insert(requests).values({ requestedByUserId: anna.id, mediaType: "tv", tmdbId: 3, title: "Show 3" });

    const discover = await call(discoverRoute.GET as Handler, { token: ANNA });
    expect(discover.status).toBe(200);
    expect(actions(discover.body.trending[0])).toEqual({ canQuickAdd: false, canRequest: true, requested: false });
    expect(actions(discover.body.popularMovies[0])).toEqual({ canQuickAdd: false, canRequest: false, requested: false });
    expect(actions(discover.body.popularSeries[0])).toEqual({ canQuickAdd: false, canRequest: false, requested: true });

    // Its See all carries the same answer.
    const list = await call(listRoute.GET as Handler, { token: ANNA, params: { list: "trending" } });
    expect(actions(list.body.results[0])).toEqual({ canQuickAdd: false, canRequest: true, requested: false });
  });

  it("holds a member to their request permissions", async () => {
    const { db } = await testDatabase();
    const ben = who.tokens.get(BEN)!;
    const permissions = ben.permissions.filter((p) => p !== "requestTv");
    await db.update(users).set({ permissions }).where(eq(users.id, ben.id));
    who.tokens.set(BEN, { ...ben, permissions });

    const discover = await call(discoverRoute.GET as Handler, { token: BEN });
    expect(actions(discover.body.popularMovies[0])).toEqual({ canQuickAdd: false, canRequest: true, requested: false });
    expect(actions(discover.body.popularSeries[0])).toEqual({ canQuickAdd: false, canRequest: false, requested: false });
  });
});

describe("Trakt syncs", () => {
  it("members see and change only their own; the admin sees everyone's", async () => {
    const created = await call(syncsRoute.POST as Handler, {
      method: "POST",
      token: ANNA,
      body: { url: "https://trakt.tv/users/anna/watchlist", tv: false },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ kind: "watchlist", name: "anna's watchlist", movies: true, tv: false, owner: { username: "anna" } });
    const id = created.body.id as string;

    expect((await call(syncsRoute.GET as Handler, { token: ANNA })).body).toMatchObject({ available: true, maxPerMember: 10 });
    expect((await call(syncsRoute.GET as Handler, { token: ANNA })).body.results).toHaveLength(1);
    expect((await call(syncsRoute.GET as Handler, { token: BEN })).body.results).toHaveLength(0);
    expect((await call(syncsRoute.GET as Handler, { token: BEN, query: "?all=true" })).status).toBe(403);
    expect((await call(syncsRoute.GET as Handler, { token: ADMIN, query: "?all=true" })).body.results).toHaveLength(1);

    expect((await call(syncRoute.PATCH as Handler, { method: "PATCH", token: BEN, params: { id }, body: { tv: true } })).status).toBe(404);
    expect((await call(syncNowRoute.POST as Handler, { method: "POST", token: BEN, params: { id } })).status).toBe(404);
    expect((await call(syncRoute.DELETE as Handler, { method: "DELETE", token: BEN, params: { id } })).status).toBe(404);

    const checked = await call(syncNowRoute.POST as Handler, { method: "POST", token: ANNA, params: { id } });
    expect(checked.status).toBe(200);
    expect(checked.body.lastSyncedAt).not.toBeNull();
    expect((await call(syncRoute.PATCH as Handler, { method: "PATCH", token: ANNA, params: { id }, body: { tv: true } })).body.tv).toBe(true);
    expect((await call(syncRoute.DELETE as Handler, { method: "DELETE", token: ADMIN, params: { id } })).body).toEqual({ ok: true });
    expect((await call(syncRoute.DELETE as Handler, { method: "DELETE", token: ADMIN, params: { id: "not-a-uuid" } })).status).toBe(404);
  });

  it("only takes trakt.tv links", async () => {
    const res = await call(syncsRoute.POST as Handler, { method: "POST", token: ANNA, body: { url: "http://localhost:3000/users/a/watchlist" } });
    expect(res.status).toBe(400);
  });
});
