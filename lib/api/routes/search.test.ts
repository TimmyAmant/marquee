import { beforeEach, describe, expect, it, vi } from "vitest";

// GET /search, /search/{section} and /search/suggest end to end: route
// modules, withApi and the real token checks on a real Postgres (PGlite),
// with TMDb mocked. Sections come back in the page's order — movies, series,
// people, studios & networks — each ranked, with totals; the fields apps
// before 0.55 read are still there; the type-ahead only offers studios and
// networks to a client that asks for them.

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
vi.mock("@/lib/integrations/credentials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/credentials")>()),
  getArrCredential: async () => ({ baseUrl: "http://arr", apiKey: "k", qualityProfileId: 1, rootFolderPath: "/media" }),
}));
vi.mock("@/lib/integrations/app-settings", () => ({ getTmdbAccessToken: async () => "token" }));

const tmdb = vi.hoisted(() => ({ calls: [] as string[] }));
const paged = <T,>(results: T[], total = results.length, pages = 1) => ({ page: 1, results, total_pages: pages, total_results: total });
vi.mock("@/lib/tmdb/client", () => ({
  isTmdbConfigured: async () => true,
  viewerContentLanguage: async () => "en-US",
  TmdbNotConfiguredError: class extends Error {},
  searchMovies: async (query: string, page: number) => {
    tmdb.calls.push(`movie:${query}:${page}`);
    if (query !== "dune") return paged([]);
    return paged(
      [
        { id: 438631, title: "Dune: Part Two", poster_path: "/p2.jpg", release_date: "2024-02-27", popularity: 400 },
        { id: 841, title: "Dune", poster_path: "/d84.jpg", release_date: "1984-12-14", popularity: 30 },
        { id: 438632, title: "Dune", poster_path: "/d21.jpg", release_date: "2021-09-15", popularity: 150 },
      ],
      57,
      3,
    );
  },
  searchTv: async (query: string) => (query === "dune" ? paged([{ id: 90228, name: "Dune: Prophecy", poster_path: null, first_air_date: "2024-11-17" }]) : paged([])),
  searchPeople: async (query: string) =>
    query === "dune"
      ? paged([{ id: 1, name: "Dune Person", profile_path: "/p.jpg", known_for_department: "Acting", known_for: [{ title: "A" }, { name: "B" }, { title: "C" }, { title: "D" }] }], 3, 1)
      : paged([]),
  searchCompany: async (query: string) =>
    query === "hbo" ? { results: [{ id: 3268, name: "HBO", logo_path: "/hbo.png", origin_country: "US" }], total_pages: 1, total_results: 1 } : { results: [], total_pages: 0, total_results: 0 },
  getNetworkDetails: async (id: number) => ({ id, name: id === 49 ? "HBO" : `Network ${id}`, logo_path: "/net.png" }),
  getMovieGenres: async () => ({ genres: [{ id: 27, name: "Horror" }] }),
  getTvGenres: async () => ({ genres: [] }),
  discoverMovies: async () => ({ results: [{ id: 694, title: "The Shining", overview: "", poster_path: null, backdrop_path: null, release_date: "1980-05-23" }] }),
  discoverTv: async () => ({ results: [] }),
  searchKeyword: async () => ({ results: [] }),
  discoverMoviesByKeyword: async () => ({ results: [] }),
  discoverTvByKeyword: async () => ({ results: [] }),
  searchMulti: async () => ({
    results: [
      { id: 1, media_type: "person", name: "Dune Person", profile_path: "/p.jpg" },
      { id: 438632, media_type: "movie", title: "Dune", release_date: "2021-09-15", popularity: 150 },
      { id: 90228, media_type: "tv", name: "Dune: Prophecy", first_air_date: "2024-11-17" },
    ],
  }),
}));

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { users } from "@/lib/db/schema";
import { presetPermissions } from "@/lib/users/permissions";
import * as searchRoute from "@/app/api/v1/search/route";
import * as sectionRoute from "@/app/api/v1/search/[section]/route";
import * as suggestRoute from "@/app/api/v1/search/suggest/route";

const ADMIN = "mqt_" + "a".repeat(43);

type Handler = (request: Request, context: { params: Promise<never> }) => Promise<Response>;

async function call(handler: Handler, { params = {}, query = "" }: { params?: Record<string, string>; query?: string } = {}) {
  const request = new Request(`http://marquee.test/api/v1/x${query}`, { headers: { authorization: `Bearer ${ADMIN}` } });
  const response = await handler(request, { params: Promise.resolve(params) as Promise<never> });
  return { status: response.status, body: await response.json() };
}

beforeEach(async () => {
  await resetTestDatabase();
  const { db } = await testDatabase();
  who.tokens.clear();
  tmdb.calls = [];
  const permissions = presetPermissions("member");
  const [row] = await db.insert(users).values({ username: "admin", role: "admin", permissions }).returning({ id: users.id });
  who.tokens.set(ADMIN, { id: row.id, username: "admin", role: "admin", permissions });
});

describe("GET /search", () => {
  it("returns the sections in order, ranked, with totals", async () => {
    const res = await call(searchRoute.GET as Handler, { query: "?q=dune" });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.sections)).toEqual(["movies", "series", "people", "studiosAndNetworks"]);
    // Studios & Networks is empty, so it's not in the order.
    expect(res.body.order).toEqual(["movies", "series", "people"]);

    const movies = res.body.sections.movies;
    expect(movies.totalResults).toBe(57);
    expect(movies.totalPages).toBe(3);
    // Exact title first (the more popular one ahead), then the prefix match.
    expect(movies.results.map((t: { tmdbId: number }) => t.tmdbId)).toEqual([438632, 841, 438631]);
    expect(movies.results[0]).toMatchObject({ mediaType: "movie", name: "Dune", year: "2021", status: null, canQuickAdd: true });

    expect(res.body.sections.series.results.map((t: { name: string }) => t.name)).toEqual(["Dune: Prophecy"]);
    expect(res.body.sections.people.results[0]).toMatchObject({ name: "Dune Person", knownForDepartment: "Acting", knownFor: ["A", "B", "C"] });
    expect(res.body.sections.studiosAndNetworks.results).toEqual([]);

    // What apps before 0.55 read.
    expect(res.body.titles.map((t: { tmdbId: number }) => t.tmdbId)).toEqual([438632, 841, 438631, 90228]);
    expect(res.body.people).toHaveLength(1);
    expect(res.body.studios).toEqual([]);
  });

  it("lifts a year in the query, searching TMDb without it", async () => {
    const res = await call(searchRoute.GET as Handler, { query: "?q=dune%201984" });
    expect(res.body.sections.movies.results[0].tmdbId).toBe(841);
    expect(tmdb.calls).toContain("movie:dune:1");
    expect(tmdb.calls).toContain("movie:dune 1984:1");
  });

  it("puts networks with studios, networks first on an exact name", async () => {
    const res = await call(searchRoute.GET as Handler, { query: "?q=hbo" });
    expect(res.body.sections.studiosAndNetworks.results).toEqual([
      { kind: "network", tmdbId: 49, name: "HBO", logoPath: "/net.png", favorited: null },
      { kind: "studio", tmdbId: 3268, name: "HBO", logoPath: "/hbo.png", favorited: false },
    ]);
    expect(res.body.sections.studiosAndNetworks.totalResults).toBe(2);
    // Older apps' `studios` has no networks (they'd open them as companies).
    expect(res.body.studios).toEqual([{ tmdbId: 3268, name: "HBO", logoPath: "/hbo.png", favorited: false }]);
  });

  it("leads with a genre the query names", async () => {
    const res = await call(searchRoute.GET as Handler, { query: "?q=horror" });
    expect(res.body.theme).toMatchObject({ label: "Horror", placement: "first" });
    expect(res.body.theme.items[0]).toMatchObject({ tmdbId: 694, name: "The Shining" });
  });

  it("needs a query", async () => {
    expect((await call(searchRoute.GET as Handler, { query: "?q=%20" })).status).toBe(400);
  });
});

describe("GET /search/{section}", () => {
  it("pages one section", async () => {
    const res = await call(sectionRoute.GET as Handler, { params: { section: "movies" }, query: "?q=dune&page=2" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 2, totalPages: 3, totalResults: 57 });
    expect(tmdb.calls).toEqual(["movie:dune:2"]);
  });

  it("serves people and studios too", async () => {
    const people = await call(sectionRoute.GET as Handler, { params: { section: "people" }, query: "?q=dune" });
    expect(people.body.results[0]).toMatchObject({ tmdbId: 1, knownFor: ["A", "B", "C"] });
    const studios = await call(sectionRoute.GET as Handler, { params: { section: "studios" }, query: "?q=hbo" });
    expect(studios.body.results.map((c: { kind: string }) => c.kind)).toEqual(["network", "studio"]);
  });

  it("rejects an unknown section", async () => {
    const res = await call(sectionRoute.GET as Handler, { params: { section: "collections" }, query: "?q=dune" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('No search section "collections" (one of movies, series, people, studios).');
  });
});

describe("GET /search/suggest", () => {
  it("groups movies, series, then people", async () => {
    const res = await call(suggestRoute.GET as Handler, { query: "?q=dune" });
    expect(res.body.results.map((s: { mediaType: string }) => s.mediaType)).toEqual(["movie", "tv", "person"]);
  });

  it("adds studios and networks only when asked", async () => {
    const plain = await call(suggestRoute.GET as Handler, { query: "?q=hbo" });
    expect(plain.body.results.some((s: { mediaType: string }) => s.mediaType === "network" || s.mediaType === "company")).toBe(false);
    const asked = await call(suggestRoute.GET as Handler, { query: "?q=hbo&include=company,network" });
    expect(asked.body.results.filter((s: { mediaType: string }) => s.mediaType === "network" || s.mediaType === "company")).toEqual([
      { id: 49, mediaType: "network", name: "HBO", posterPath: "/net.png", subtitle: null },
      { id: 3268, mediaType: "company", name: "HBO", posterPath: "/hbo.png", subtitle: null },
    ]);
  });
});
