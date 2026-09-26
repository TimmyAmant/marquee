import { beforeEach, describe, expect, it, vi } from "vitest";

// A custom Discover row's titles, with TMDb, Trakt and the library mocked:
// which TMDb calls each kind makes, how movies and series mix, paging, and
// failing soft to an empty row.

vi.mock("server-only", () => ({}));
const tmdb = vi.hoisted(() => ({
  discoverForShelf: vi.fn(),
  getTmdbList: vi.fn(),
}));
vi.mock("@/lib/tmdb/client", () => tmdb);
const titles = vi.hoisted(() => ({ getOrFetchTitle: vi.fn() }));
vi.mock("@/lib/tmdb/cache", () => titles);
const settings = vi.hoisted(() => ({ clientId: "client" as string | null }));
vi.mock("@/lib/integrations/app-settings", () => ({ getTraktClientId: async () => settings.clientId }));
const trakt = vi.hoisted(() => ({ getTraktItemsPage: vi.fn() }));
vi.mock("@/lib/trakt/client", async () => ({ ...(await import("@/lib/trakt/url")), getTraktItemsPage: trakt.getTraktItemsPage }));
const library = vi.hoisted(() => ({ getRecentlyAdded: vi.fn() }));
vi.mock("@/lib/library/query", () => library);

import { customShelfMaxPage, fetchCustomShelfPage } from "./custom-shelves";
import type { ShelfSource } from "./shelves";

const viewer = { userId: "u", isAdmin: false, libraryOwnerId: "owner" };
const source = (over: Partial<ShelfSource>): ShelfSource => ({ mediaType: "all", tmdbId: 1, name: null, url: null, ...over });
const result = (id: number, popularity: number, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Movie ${id}`,
  name: `Show ${id}`,
  overview: "",
  poster_path: `/p${id}.jpg`,
  backdrop_path: null,
  release_date: "2024-05-01",
  first_air_date: "2023-01-01",
  popularity,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  settings.clientId = "client";
});

describe("TMDb rows", () => {
  it("a keyword row for both kinds asks TMDb for movies and series, two pages each, mixed by popularity", async () => {
    tmdb.discoverForShelf.mockImplementation(async (type: string, _filter: unknown, page: number) => ({
      page,
      results: page === 1 ? [result(type === "movie" ? 10 : 20, type === "movie" ? 5 : 9)] : [],
      total_pages: type === "movie" ? 3 : 800,
      total_results: type === "movie" ? 50 : 16000,
    }));
    const page = await fetchCustomShelfPage({ kind: "keyword", source: source({ tmdbId: 210024 }) }, 1, viewer);
    expect(tmdb.discoverForShelf.mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual(
      expect.arrayContaining([
        ["movie", { keywordId: 210024 }, 1],
        ["movie", { keywordId: 210024 }, 2],
        ["tv", { keywordId: 210024 }, 1],
        ["tv", { keywordId: 210024 }, 2],
      ]),
    );
    expect(page.items).toEqual([
      { mediaType: "tv", tmdbId: 20, name: "Show 20", posterPath: "/p20.jpg", year: "2023" },
      { mediaType: "movie", tmdbId: 10, name: "Movie 10", posterPath: "/p10.jpg", year: "2024" },
    ]);
    // TMDb stops at page 500: 250 list pages of 2.
    expect(page.totalPages).toBe(250);
    expect(page.totalResults).toBe(16050);
  });

  it("a network row is series only, a genre or studio row one kind when picked", async () => {
    tmdb.discoverForShelf.mockResolvedValue({ page: 1, results: [], total_pages: 1, total_results: 0 });
    await fetchCustomShelfPage({ kind: "network", source: source({ tmdbId: 213, mediaType: "tv" }) }, 1, viewer);
    await fetchCustomShelfPage({ kind: "genre", source: source({ tmdbId: 28, mediaType: "movie" }) }, 2, viewer);
    await fetchCustomShelfPage({ kind: "company", source: source({ tmdbId: 41077, mediaType: "movie" }) }, 1, viewer);
    expect(tmdb.discoverForShelf.mock.calls.map((c) => `${c[0]} ${JSON.stringify(c[1])} ${c[2]}`)).toEqual([
      'tv {"networkId":213} 1',
      'tv {"networkId":213} 2',
      'movie {"genreId":28} 3',
      'movie {"genreId":28} 4',
      'movie {"companyId":41077} 1',
      'movie {"companyId":41077} 2',
    ]);
  });

  it("a TMDb list keeps movies and series and skips anything else", async () => {
    tmdb.getTmdbList.mockResolvedValue({
      id: 8136,
      name: "Star Wars",
      page: 1,
      total_pages: 2,
      total_results: 23,
      items: [
        { id: 11, media_type: "movie", title: "Star Wars", poster_path: "/sw.jpg", release_date: "1977-05-25" },
        { id: 1, media_type: "person", name: "Someone", poster_path: null },
        { id: 82856, media_type: "tv", name: "The Mandalorian", poster_path: null, first_air_date: "2019-11-12" },
      ],
    });
    const page = await fetchCustomShelfPage({ kind: "tmdbList", source: source({ tmdbId: 8136 }) }, 1, viewer);
    expect(tmdb.getTmdbList).toHaveBeenCalledWith(8136, 1);
    expect(page).toEqual({
      items: [
        { mediaType: "movie", tmdbId: 11, name: "Star Wars", posterPath: "/sw.jpg", year: "1977" },
        { mediaType: "tv", tmdbId: 82856, name: "The Mandalorian", posterPath: null, year: "2019" },
      ],
      totalPages: 2,
      totalResults: 23,
    });
  });

  it("fails soft to an empty row", async () => {
    tmdb.discoverForShelf.mockRejectedValue(new Error("TMDb down"));
    tmdb.getTmdbList.mockRejectedValue(new Error("TMDb down"));
    expect((await fetchCustomShelfPage({ kind: "keyword", source: source({}) }, 1, viewer)).items).toEqual([]);
    expect((await fetchCustomShelfPage({ kind: "tmdbList", source: source({}) }, 1, viewer)).items).toEqual([]);
    expect((await fetchCustomShelfPage({ kind: "mystery", source: source({}) }, 1, viewer)).items).toEqual([]);
    expect((await fetchCustomShelfPage({ kind: "keyword", source: null }, 1, viewer)).items).toEqual([]);
  });
});

describe("Trakt rows", () => {
  const url = "https://trakt.tv/users/someone/lists/best-of-2024";

  it("reads the list from Trakt's API a page at a time, and looks the posters up", async () => {
    trakt.getTraktItemsPage.mockResolvedValue({
      items: [
        { type: "movie", movie: { title: "Dune", year: 2021, ids: { tmdb: 438631 } } },
        { type: "show", show: { title: "No TMDb id", year: 2020, ids: { tmdb: null } } },
        { type: "show", show: { title: "Severance", year: 2022, ids: { tmdb: 95396 } } },
      ],
      pageCount: 4,
      itemCount: 150,
    });
    titles.getOrFetchTitle.mockImplementation(async (mediaType: string, tmdbId: number) =>
      tmdbId === 438631 ? { name: "Dune", posterPath: "/dune.jpg", releaseDate: "2021-09-15", firstAirDate: null } : null,
    );
    const page = await fetchCustomShelfPage({ kind: "traktList", source: source({ url }) }, 2, viewer, { pageSize: 20 });
    expect(trakt.getTraktItemsPage).toHaveBeenCalledWith(
      { clientId: "client" },
      { kind: "list", username: "someone", slug: "best-of-2024" },
      2,
      20,
    );
    expect(page).toEqual({
      items: [
        { mediaType: "movie", tmdbId: 438631, name: "Dune", posterPath: "/dune.jpg", year: "2021" },
        { mediaType: "tv", tmdbId: 95396, name: "Severance", posterPath: null, year: "2022" },
      ],
      totalPages: 4,
      totalResults: 150,
    });
  });

  it("is empty without Trakt connected, or for a link that isn't Trakt's", async () => {
    settings.clientId = null;
    expect((await fetchCustomShelfPage({ kind: "traktList", source: source({ url }) }, 1, viewer)).items).toEqual([]);
    settings.clientId = "client";
    expect((await fetchCustomShelfPage({ kind: "traktList", source: source({ url: "https://evil.example/users/a/lists/b" }) }, 1, viewer)).items).toEqual([]);
    expect(trakt.getTraktItemsPage).not.toHaveBeenCalled();
  });
});

describe("recently added rows", () => {
  it("read the library, one kind when picked, paged like Recently Added", async () => {
    library.getRecentlyAdded.mockResolvedValue(
      Array.from({ length: 41 }, (_, i) => ({
        titleId: `t${i}`,
        mediaType: "movie",
        tmdbId: i + 1,
        name: `Movie ${i}`,
        posterPath: null,
        year: "2024",
        status: "owned",
        addedAt: new Date(),
      })),
    );
    const page = await fetchCustomShelfPage({ kind: "library", source: source({ mediaType: "movie", tmdbId: null }) }, 1, viewer);
    expect(library.getRecentlyAdded).toHaveBeenCalledWith("owner", 41, "movie");
    expect(page.items).toHaveLength(40);
    expect(page.items[0]).toMatchObject({ status: "owned" });
    expect(page.totalPages).toBe(2);
    expect((await fetchCustomShelfPage({ kind: "library", source: source({}) }, 1, { userId: null, isAdmin: false, libraryOwnerId: null })).items).toEqual([]);
  });

  it("each kind has its own deepest page", () => {
    expect(customShelfMaxPage("library")).toBe(25);
    expect(customShelfMaxPage("keyword")).toBe(250);
    expect(customShelfMaxPage("tmdbList")).toBe(500);
    expect(customShelfMaxPage("traktList")).toBe(100);
  });
});
