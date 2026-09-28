import { beforeEach, describe, expect, it, vi } from "vitest";

// The Library endpoints end to end: the route modules, withApi and the real
// token checks, over the seeded library on a real Postgres (PGlite). A
// member sees the admin's library (the household), without file paths or
// the arr handles; only the admin gets the duplicates.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/auth", () => ({ auth: async () => null, signIn: async () => undefined, signOut: async () => undefined, handlers: {} }));

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
vi.mock("@/lib/tmdb/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tmdb/client")>()),
  getCollection: async (id: number) => ({
    id,
    name: "The Matrix Collection",
    poster_path: null,
    parts: [
      { id: 604, title: "The Matrix Reloaded", poster_path: null, release_date: "2003-05-15" },
      { id: 603, title: "The Matrix", poster_path: null, release_date: "1999-03-30" },
      { id: 605, title: "The Matrix Revolutions", poster_path: null, release_date: "2003-11-05" },
    ],
  }),
}));

import { resetTestDatabase } from "@/lib/test/pglite";
import { GB, seedLibrary } from "@/lib/test/library-seed";
import * as pageRoute from "@/app/api/v1/library/route";
import * as collectionsRoute from "@/app/api/v1/library/collections-missing/route";
import * as duplicatesRoute from "@/app/api/v1/library/duplicates/route";
import * as storageRoute from "@/app/api/v1/library/storage/route";
import type { LibraryCollection, LibraryDuplicate, LibraryEntry, LibraryPage, LibraryStorage } from "@/lib/api/types";

const ADMIN = "mqt_" + "a".repeat(43);
const MEMBER = "mqt_" + "m".repeat(43);

type Handler = (request: Request, context: { params: Promise<never> }) => Promise<Response>;

async function call<T>(handler: Handler, { token = ADMIN, query = "" }: { token?: string; query?: string } = {}) {
  const request = new Request(`http://marquee.test/api/v1/library${query}`, { headers: { authorization: `Bearer ${token}` } });
  const response = await handler(request, { params: Promise.resolve({}) as Promise<never> });
  return { status: response.status, body: (await response.json()) as T };
}

beforeEach(async () => {
  await resetTestDatabase();
  const { adminId, memberId } = await seedLibrary();
  who.tokens.clear();
  who.tokens.set(ADMIN, { id: adminId, username: "admin", role: "admin", permissions: [] });
  who.tokens.set(MEMBER, { id: memberId, username: "member", role: "member", permissions: ["requestMovies", "requestTv"] });
});

describe("GET /library", () => {
  it("lists the household library with counts and filter choices", async () => {
    const { status, body } = await call<LibraryPage>(pageRoute.GET);
    expect(status).toBe(200);
    expect(body).toMatchObject({ page: 1, pageSize: 60, totalPages: 1, totalResults: 5, connected: false });
    expect(body.summary).toEqual({ movies: 2, series: 1, episodes: 64, totalBytes: 110 * GB, tracked: 2 });
    expect(body.filters).toEqual({
      sources: ["plex", "jellyfin", "radarr", "sonarr"],
      genres: ["Action", "Crime", "Drama", "Science Fiction"],
      codecs: ["H264", "HEVC"],
      years: [2022, 2011, 2010, 1999, 1995],
      resolutions: ["4K", "1080p"],
      hasHdr: true,
    });
    expect(body.results.map((r) => r.tmdbId)).toEqual([949, 1399, 603, 95396, 27205]);

    const matrix = body.results.find((r) => r.tmdbId === 603)!;
    expect(matrix).toMatchObject({
      mediaType: "movie",
      name: "The Matrix",
      year: "1999",
      status: "owned",
      favorited: false,
      canQuickAdd: false,
      canRequest: false,
      source: "jellyfin",
      sizeBytes: 8 * GB,
      addedAt: "2026-08-01T18:00:00.000Z",
      genres: ["Action", "Science Fiction"],
      resolution: "4K",
      hdr: "Dolby Vision",
      videoCodec: "H264",
      audioCodec: "TrueHD Atmos",
      quality: "Bluray-2160p",
      filePath: "/movies/The Matrix (1999)/The Matrix (1999) WEBDL-1080p.mkv",
      episodeCount: null,
      upgradeAvailable: false,
      possibleDuplicate: true,
      arrTracking: { arrId: 12, monitored: true },
    });
    expect(body.results.find((r) => r.tmdbId === 1399)).toMatchObject({ episodeCount: 61, resolution: "1080p", hdr: null, arrTracking: { arrId: 7, monitored: true } });
    expect(body.results.find((r) => r.tmdbId === 949)).toMatchObject({ hdr: "HDR10", arrTracking: null, addedAt: "2026-09-25T18:00:00.000Z" });
    // A series poster's have/aired, from Sonarr; never a movie's.
    expect(body.results.find((r) => r.tmdbId === 1399)?.episodes).toEqual({ have: 73, total: 73 });
    expect(body.results.find((r) => r.tmdbId === 95396)?.episodes).toEqual({ have: 3, total: 19 });
    expect(matrix.episodes).toBeNull();
    expect(body.results.find((r) => r.tmdbId === 27205)).toMatchObject({ status: "tracked_monitored", resolution: null, addedAt: null });
  });

  it("filters, sorts and pages", async () => {
    const drama = await call<LibraryPage>(pageRoute.GET, { query: "?genre=drama&sort=title" });
    expect(drama.body.results.map((r) => r.name)).toEqual(["Game of Thrones", "Severance"]);
    const hdr = await call<LibraryPage>(pageRoute.GET, { query: "?hdr=1&type=movie" });
    expect(hdr.body.results.map((r) => r.tmdbId)).toEqual([949, 603]);
    const paged = await call<LibraryPage>(pageRoute.GET, { query: "?sort=size&page=2&pageSize=2" });
    expect(paged.body).toMatchObject({ page: 2, pageSize: 2, totalPages: 3, totalResults: 5 });
    expect(paged.body.results.map((r) => r.tmdbId)).toEqual([603, 95396]);
    // The counts and choices describe the whole library, not the page.
    expect(paged.body.summary.movies).toBe(2);
    expect(paged.body.filters.genres).toHaveLength(4);
    const searched = await call<LibraryPage>(pageRoute.GET, { query: "?q=heat&source=jellyfin&resolution=1080p&codec=HEVC&year=1995&status=owned" });
    expect(searched.body.results.map((r) => r.tmdbId)).toEqual([949]);
    const none = await call<LibraryPage>(pageRoute.GET, { query: "?q=zzz" });
    expect(none.body).toMatchObject({ totalResults: 0, totalPages: 1, results: [] });
  });

  it("refuses a bad filter", async () => {
    for (const query of ["?sort=colour", "?type=book", "?status=untracked", "?year=abc", "?page=0", "?pageSize=500", "?hdr=maybe"]) {
      const { status, body } = await call<{ code: string }>(pageRoute.GET, { query });
      expect([query, status]).toEqual([query, 400]);
      expect(body.code).toBe("invalid");
    }
  });

  it("shows a member the household library, without paths or arr handles", async () => {
    const { status, body } = await call<LibraryPage>(pageRoute.GET, { token: MEMBER });
    expect(status).toBe(200);
    expect(body.totalResults).toBe(5);
    const entries: LibraryEntry[] = body.results;
    expect(entries.every((r) => r.filePath === null && r.arrTracking === null)).toBe(true);
    expect(entries.find((r) => r.tmdbId === 603)).toMatchObject({ resolution: "4K", possibleDuplicate: true });
  });

  it("needs a token", async () => {
    const { status } = await call(pageRoute.GET, { token: "mqt_" + "x".repeat(43) });
    expect(status).toBe(401);
  });
});

describe("GET /library/collections-missing", () => {
  it("lists the collection the library has part of, with Add all for the admin", async () => {
    const { status, body } = await call<{ results: LibraryCollection[] }>(collectionsRoute.GET);
    expect(status).toBe(200);
    expect(body.results).toHaveLength(1);
    const [collection] = body.results;
    expect(collection).toMatchObject({ key: "collection-2344", title: "The Matrix Collection", collectionId: 2344, collectionFavorited: false, missingCount: 2 });
    expect(collection.items.map((i) => [i.tmdbId, i.status])).toEqual([
      [603, "owned"],
      [604, null],
      [605, null],
    ]);
    // Radarr isn't fully configured on the test server, so nothing can be added.
    expect(collection.addAllMissing).toEqual([]);
    expect(collection.requestAllMissing).toEqual([]);
    expect(collection.requestAllTarget).toEqual({ mediaType: "movie", tmdbId: 603 });
  });

  it("offers a member Request all missing instead", async () => {
    const { body } = await call<{ results: LibraryCollection[] }>(collectionsRoute.GET, { token: MEMBER });
    const [collection] = body.results;
    expect(collection.items.filter((i) => i.canRequest).map((i) => i.tmdbId)).toEqual([604, 605]);
    expect(collection.requestAllMissing).toEqual([
      { mediaType: "movie", tmdbId: 604 },
      { mediaType: "movie", tmdbId: 605 },
    ]);
    expect(collection.addAllMissing).toEqual([]);
  });
});

describe("GET /library/duplicates", () => {
  it("lists the admin's duplicates with every copy", async () => {
    const { status, body } = await call<{ results: LibraryDuplicate[] }>(duplicatesRoute.GET);
    expect(status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({ tmdbId: 603, reason: "paths" });
    expect(body.results[0].copies).toHaveLength(3);
  });

  it("is the admin's alone", async () => {
    const { status, body } = await call<{ code: string; error: string }>(duplicatesRoute.GET, { token: MEMBER });
    expect(status).toBe(403);
    expect(body).toEqual({ code: "forbidden", error: "Only the admin can see duplicates." });
  });
});

describe("GET /library/storage", () => {
  it("falls back to the newest snapshots when no server answers, and forecasts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
    try {
      const { status, body } = await call<LibraryStorage>(storageRoute.GET, { token: MEMBER });
      expect(status).toBe(200);
      expect(body.live).toBe(false);
      expect(body.measuredAt).toBe("2026-09-11T03:00:00.000Z");
      expect(body.folders).toEqual([
        { path: "/movies", freeBytes: 900 * GB, servers: [] },
        { path: "/tv", freeBytes: 500 * GB, servers: [] },
      ]);
      expect(body.totalFreeBytes).toBe(1400 * GB);
      expect(body.forecast).toEqual({ daysRemaining: 90, bytesPerDay: 10 * GB, fullOn: "2026-12-19" });
    } finally {
      vi.useRealTimers();
    }
  });
});
