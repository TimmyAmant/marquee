import { beforeEach, describe, expect, it, vi } from "vitest";

// The blocklist's automatic rules against a real Postgres (PGlite): a
// rating in a country and TMDb's adult flag, what a rule's preview finds
// among the titles Marquee keeps, and a request refused by one.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
vi.mock("@/lib/cache/revalidate", () => ({ revalidatePathSafely: () => undefined }));
vi.mock("@/lib/tmdb/cache", () => ({ getOrFetchTitle: async () => null }));

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { requests, titles, users } from "@/lib/db/schema";
import {
  blockByRule,
  findBlock,
  listBlocklist,
  parseBlockRule,
  previewBlockRule,
  ruleBlocks,
  titleCertifications,
} from "@/lib/requests/blocklist";

const nc17Movie = {
  adult: false,
  release_dates: {
    results: [
      { iso_3166_1: "US", release_dates: [{ type: 3, release_date: "2020-01-01", certification: "NC-17" }] },
      { iso_3166_1: "DE", release_dates: [{ type: 3, release_date: "2020-01-01", certification: "18" }] },
    ],
  },
};
const tvMaShow = { content_ratings: { results: [{ iso_3166_1: "US", rating: "TV-MA" }] } };
const adultMovie = { adult: true };
const familyMovie = {
  release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ type: 3, release_date: "2020-01-01", certification: "PG" }] }] },
};

describe("reading ratings", () => {
  it("reads a movie's release certifications and a show's content ratings", () => {
    expect(titleCertifications(nc17Movie, "movie")).toEqual([
      { region: "US", rating: "NC-17" },
      { region: "DE", rating: "18" },
    ]);
    expect(titleCertifications(tvMaShow, "tv")).toEqual([{ region: "US", rating: "TV-MA" }]);
    expect(titleCertifications(null, "tv")).toEqual([]);
  });

  it("matches a rule only in its own country", () => {
    expect(ruleBlocks({ kind: "certification", region: "US", rating: "NC-17" }, nc17Movie, "movie")).toBe(true);
    expect(ruleBlocks({ kind: "certification", region: "GB", rating: "NC-17" }, nc17Movie, "movie")).toBe(false);
    expect(ruleBlocks({ kind: "certification", region: "US", rating: "TV-MA" }, tvMaShow, "tv")).toBe(true);
    expect(ruleBlocks({ kind: "adult" }, adultMovie, "movie")).toBe(true);
    expect(ruleBlocks({ kind: "adult" }, nc17Movie, "movie")).toBe(false);
  });
});

describe("rules on the blocklist", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    const { db } = await testDatabase();
    const [anna] = await db.insert(users).values({ username: "anna", role: "member", permissions: [] }).returning();
    await db.insert(titles).values([
      { mediaType: "movie", tmdbId: 1, name: "Rated", releaseDate: "2020-01-01", rawTmdb: nc17Movie },
      { mediaType: "tv", tmdbId: 2, name: "Mature", firstAirDate: "2019-01-01", rawTmdb: tvMaShow },
      { mediaType: "movie", tmdbId: 3, name: "Family", rawTmdb: familyMovie },
      { mediaType: "movie", tmdbId: 4, name: "Adult", rawTmdb: adultMovie },
    ]);
    await db.insert(requests).values({ requestedByUserId: anna.id, mediaType: "movie", tmdbId: 1, title: "Rated" });
  });

  it("checks what's sent", async () => {
    expect((await parseBlockRule({ kind: "certification", region: "usa", certification: "R" })).ok).toBe(false);
    expect((await parseBlockRule({ kind: "certification", region: "us", certification: " " })).ok).toBe(false);
    expect(await parseBlockRule({ kind: "certification", region: "us", certification: "nc-17" })).toEqual({
      ok: true,
      rule: { kind: "certification", region: "US", rating: "NC-17" },
    });
    expect((await parseBlockRule({ kind: "everything" })).ok).toBe(false);
    expect(await parseBlockRule({ keyword: " Anime " })).toEqual({ ok: true, rule: { kind: "keyword", keyword: "anime" } });
  });

  it("previews what a rule would block, and the requests waiting for it", async () => {
    const preview = await previewBlockRule({ kind: "certification", region: "US", rating: "NC-17" });
    expect(preview).toMatchObject({ scanned: 4, matched: 1, titles: [{ mediaType: "movie", tmdbId: 1, name: "Rated", year: "2020" }] });
    expect(preview.pendingRequests.map((r) => r.title)).toEqual(["Rated"]);
    expect((await previewBlockRule({ kind: "adult" })).titles.map((t) => t.name)).toEqual(["Adult"]);
  });

  it("refuses requests the rules catch, once added", async () => {
    await blockByRule({ kind: "certification", region: "US", rating: "TV-MA" }, "Not for the kids' account");
    await blockByRule({ kind: "adult" }, null);
    // Adding the same rule again just updates its reason.
    await blockByRule({ kind: "adult" }, "No adult titles");
    expect((await listBlocklist()).map((e) => [e.kind, e.region, e.keyword, e.reason])).toEqual([
      ["adult", null, null, "No adult titles"],
      ["certification", "US", "TV-MA", "Not for the kids' account"],
    ]);
    expect(await findBlock("tv", 2, tvMaShow)).toEqual({ reason: "Not for the kids' account", keyword: "TV-MA (US)" });
    expect(await findBlock("movie", 4, adultMovie)).toEqual({ reason: "No adult titles", keyword: "adult" });
    expect(await findBlock("movie", 3, familyMovie)).toBeNull();
  });
});
