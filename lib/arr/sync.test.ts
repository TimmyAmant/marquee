import { beforeEach, describe, expect, it, vi } from "vitest";

// The hourly Radarr library sync against a real Postgres (PGlite,
// lib/test/pglite.ts): rows written in batches, titles gone from Radarr
// dropped, TMDb asked only about titles the cache doesn't have, and news
// the download watch wrote while the sync was still going not overwritten
// with the sync's older listing. Radarr and TMDb are mocked out.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
type Movie = { id: number; tmdbId: number; monitored: boolean; status: string; hasFile: boolean; movieFile?: object; title?: string };
const radarr = vi.hoisted(() => ({
  movies: [] as Movie[],
  /** Runs while Radarr is being listed — something else writing meanwhile. */
  duringListing: async () => undefined as void,
}));
vi.mock("@/lib/radarr/client", () => ({
  getAllMovies: async () => {
    const movies = radarr.movies;
    await radarr.duringListing();
    return movies;
  },
  getQueueSummaries: async () => new Map(),
}));
vi.mock("@/lib/sonarr/client", () => ({}));
const servers = vi.hoisted(() => ({ list: [] as { id: string; baseUrl: string; apiKey: string }[] }));
vi.mock("@/lib/arr/servers", () => ({
  arrConfig: (s: { baseUrl: string; apiKey: string }) => s,
  listLibraryServers: async (_userId: string, kind: string) => (kind === "radarr" ? servers.list : []),
  ownersWithLibraryServers: async () => [],
}));
const tmdb = vi.hoisted(() => ({
  getOrFetchTitle: vi.fn(async (..._args: unknown[]) => null),
  upsertTitleLight: vi.fn(async (..._args: unknown[]) => null),
}));
vi.mock("@/lib/tmdb/cache", () => tmdb);
vi.mock("@/lib/tmdb/cross-reference", () => ({ lookupTmdbIdFromTvdbId: async () => ({ tmdbId: null, failed: false }) }));

import { and, eq } from "drizzle-orm";
import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { arrServers, arrStatusCache, titles, tmdbIdOverrides, users } from "@/lib/db/schema";
import { syncArrLibrary } from "@/lib/arr/sync";

let admin: string;
let serverId: string;

const movie = (tmdbId: number, hasFile = false): Movie => ({
  id: tmdbId,
  tmdbId,
  monitored: true,
  status: "released",
  hasFile,
  movieFile: hasFile ? { size: 1, path: `/movies/${tmdbId}.mkv` } : undefined,
});

async function rows() {
  const { db } = await testDatabase();
  return db.select().from(arrStatusCache).where(eq(arrStatusCache.userId, admin));
}

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
  radarr.duringListing = async () => undefined;
  const { db } = await testDatabase();
  const [a] = await db.insert(users).values({ username: "admin", role: "admin", permissions: [] }).returning();
  admin = a.id;
  const [server] = await db
    .insert(arrServers)
    .values({
      userId: admin,
      kind: "radarr",
      name: "Radarr",
      baseUrl: "http://radarr",
      apiKeyEnc: Buffer.from("x"),
      apiKeyIv: Buffer.from("x"),
      apiKeyTag: Buffer.from("x"),
      isDefault: true,
      webhookSecret: "s",
    })
    .returning();
  serverId = server.id;
  servers.list = [{ id: server.id, baseUrl: "http://radarr", apiKey: "k" }];
});

describe("syncArrLibrary (Radarr)", () => {
  it("writes every title in batches, applies tmdbId corrections, and drops titles Radarr no longer has", async () => {
    const { db } = await testDatabase();
    await db.insert(tmdbIdOverrides).values({ userId: admin, mediaType: "movie", wrongTmdbId: 7, correctTmdbId: 70007 });
    radarr.movies = Array.from({ length: 250 }, (_, i) => movie(i + 1, i % 2 === 0));
    expect(await syncArrLibrary(admin, "radarr")).toEqual({ count: 250 });
    const written = await rows();
    expect(written).toHaveLength(250);
    expect(written.find((r) => r.externalId === 70007)).toMatchObject({ serverId, arrId: 7 });
    expect(written.find((r) => r.externalId === 1)).toMatchObject({ status: "owned", filePath: "/movies/1.mkv" });
    expect(written.find((r) => r.externalId === 2)).toMatchObject({ status: "tracked_monitored" });

    radarr.movies = [movie(1, true), movie(2, true)];
    expect(await syncArrLibrary(admin, "radarr")).toEqual({ count: 2 });
    const after = await rows();
    expect(after.map((r) => r.externalId).sort((a, b) => a - b)).toEqual([1, 2]);
    expect(after.find((r) => r.externalId === 2)).toMatchObject({ status: "owned" });
  });

  it("asks TMDb only about titles the cache doesn't already have", async () => {
    const { db } = await testDatabase();
    await db.insert(titles).values({
      mediaType: "movie",
      tmdbId: 1,
      name: "Cached",
      posterPath: "/p.jpg",
      backdropPath: "/b.jpg",
      overview: "Here already.",
      rawTmdb: {},
      refreshedAt: new Date(),
    });
    radarr.movies = [movie(1), movie(2)];
    await syncArrLibrary(admin, "radarr");
    expect(tmdb.getOrFetchTitle.mock.calls).toEqual([["movie", 2]]);
  });

  it("saves Radarr's name for a title TMDb can't supply, so the Library still lists it", async () => {
    radarr.movies = [{ ...movie(3), title: "Only In Radarr" }];
    await syncArrLibrary(admin, "radarr");
    expect(tmdb.upsertTitleLight).toHaveBeenCalledWith({ mediaType: "movie", tmdbId: 3, name: "Only In Radarr" });
  });

  it("keeps what the download watch wrote while the sync was still going", async () => {
    const { db } = await testDatabase();
    radarr.movies = [movie(1), movie(2)];
    await syncArrLibrary(admin, "radarr");

    // Mid-sync, the download watch sees movie 1 start downloading, and a
    // title added from Marquee lands that this listing doesn't have yet.
    radarr.duringListing = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await db
        .update(arrStatusCache)
        .set({ status: "tracked_downloading", downloadProgress: 40, checkedAt: new Date() })
        .where(and(eq(arrStatusCache.userId, admin), eq(arrStatusCache.externalId, 1)));
      await db.insert(arrStatusCache).values({
        userId: admin,
        provider: "radarr",
        externalId: 3,
        serverId,
        arrId: 3,
        status: "tracked_monitored",
        checkedAt: new Date(),
      });
    };
    await syncArrLibrary(admin, "radarr");

    const after = await rows();
    expect(after.find((r) => r.externalId === 1)).toMatchObject({ status: "tracked_downloading", downloadProgress: 40 });
    expect(after.find((r) => r.externalId === 2)).toMatchObject({ status: "tracked_monitored" });
    expect(after.find((r) => r.externalId === 3)).toBeDefined();
  });
});
