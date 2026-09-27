import { beforeEach, describe, expect, it, vi } from "vitest";

const searchMulti = vi.fn();
const searchCompany = vi.fn();
const getNetworkDetails = vi.fn();
const getLibraryStatusMap = vi.fn();

vi.mock("@/lib/tmdb/client", () => ({
  searchMulti: (...args: unknown[]) => searchMulti(...args),
  searchCompany: (...args: unknown[]) => searchCompany(...args),
  getNetworkDetails: (...args: unknown[]) => getNetworkDetails(...args),
}));
vi.mock("@/lib/library/query", () => ({
  getLibraryStatusMap: (...args: unknown[]) => getLibraryStatusMap(...args),
}));

const { getSearchSuggestions, groupSuggestions, wantsCompanies } = await import("./suggest");
const { groupRuns, suggestionGroup } = await import("./suggestion-groups");

// TMDb's search/multi mixes kinds in its own order.
const RESULTS = [
  { id: 6384, media_type: "person", name: "Keanu Reeves", profile_path: "/k.jpg", known_for_department: "Acting", popularity: 50 },
  { id: 603, media_type: "movie", title: "The Matrix", poster_path: "/m.jpg", release_date: "1999-03-31", popularity: 80 },
  { id: 1399, media_type: "tv", name: "Game of Thrones", poster_path: "/g.jpg", first_air_date: "2011-04-17", popularity: 300 },
  { id: 604, media_type: "movie", title: "The Matrix Reloaded", poster_path: null, release_date: "2003-05-15", popularity: 40 },
];

beforeEach(() => {
  searchMulti.mockReset().mockResolvedValue({ results: RESULTS });
  searchCompany.mockReset().mockResolvedValue({ results: [] });
  getNetworkDetails.mockReset().mockImplementation(async (id: number) => ({ id, name: id === 49 ? "HBO" : `Network ${id}`, logo_path: "/n.png" }));
  getLibraryStatusMap.mockReset();
});

describe("groupSuggestions", () => {
  it("groups movies, then TV shows, then people, then studios & networks", () => {
    const list = groupSuggestions("the matrix", RESULTS as never, [
      { kind: "company", id: 1, name: "The Matrix Studio", logoPath: "/ms.png" },
      { kind: "network", id: 49, name: "HBO", logoPath: "/h.png" },
    ]);
    expect(list.map((s) => s.mediaType)).toEqual(["movie", "movie", "tv", "person", "company", "network"]);
    expect(list[0]).toEqual({ id: 603, mediaType: "movie", name: "The Matrix", posterPath: "/m.jpg", subtitle: "1999" });
    expect(list.find((s) => s.mediaType === "person")).toMatchObject({ posterPath: "/k.jpg", subtitle: "Acting" });
  });

  it("ranks inside a group: the exact title first, a year in the query lifting that year", () => {
    const multi = [
      { id: 1, media_type: "movie", title: "Dune: Part Two", release_date: "2024-02-27", popularity: 500 },
      { id: 2, media_type: "movie", title: "Dune", release_date: "1984-12-14", popularity: 30 },
      { id: 3, media_type: "movie", title: "Dune", release_date: "2021-09-15", popularity: 150 },
    ];
    expect(groupSuggestions("dune", multi as never).map((s) => s.id)).toEqual([3, 2, 1]);
    expect(groupSuggestions("dune 1984", multi as never).map((s) => s.id)).toEqual([2, 3, 1]);
  });

  it("puts People first when the query names a well-known person, and drops photo-less unknowns", () => {
    const multi = [
      { id: 1, media_type: "movie", title: "Tom Hanks: The Nomad", popularity: 2 },
      { id: 31, media_type: "person", name: "Tom Hanks", profile_path: "/t.jpg", popularity: 60 },
      { id: 32, media_type: "person", name: "Tom Hanksley", profile_path: null, popularity: 0.2 },
    ];
    expect(groupSuggestions("tom hanks", multi as never).map((s) => `${s.mediaType}:${s.id}`)).toEqual(["person:31", "movie:1"]);
  });

  it("caps each group", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: i, media_type: "movie", title: `Movie ${i}` }));
    expect(groupSuggestions("movie", many as never)).toHaveLength(4);
  });

  it("leaves out studios that only loosely match", () => {
    const list = groupSuggestions("a24", [], [
      { kind: "company", id: 41077, name: "A24", logoPath: "/a24.png" },
      { kind: "company", id: 9, name: "Studio Twenty-Four", logoPath: null },
    ]);
    expect(list.map((s) => s.name)).toEqual(["A24"]);
  });
});

describe("getSearchSuggestions", () => {
  it("adds the viewer's library status to titles only, untracked by default", async () => {
    getLibraryStatusMap.mockResolvedValue(
      new Map([
        ["movie:603", "owned"],
        ["tv:1399", "tracked_downloading"],
      ]),
    );

    const results = await getSearchSuggestions("matrix", "owner-1");

    expect(getLibraryStatusMap).toHaveBeenCalledWith("owner-1", [
      { mediaType: "movie", tmdbId: 603 },
      { mediaType: "movie", tmdbId: 604 },
      { mediaType: "tv", tmdbId: 1399 },
    ]);
    expect(results.map((r) => [r.id, r.status])).toEqual([
      [603, "owned"],
      [604, "untracked"],
      [1399, "tracked_downloading"],
      [6384, undefined],
    ]);
    expect(results[3]).not.toHaveProperty("status");
  });

  it("only looks up studios and networks when asked to", async () => {
    await getSearchSuggestions("hbo", null);
    expect(searchCompany).not.toHaveBeenCalled();
    expect(getNetworkDetails).not.toHaveBeenCalled();

    searchCompany.mockResolvedValue({ results: [{ id: 3268, name: "HBO", logo_path: "/hbo.png", origin_country: "US" }] });
    const results = await getSearchSuggestions("hbo", null, { includeCompanies: true });
    expect(getNetworkDetails).toHaveBeenCalledWith(49);
    expect(results.filter((r) => r.mediaType === "network" || r.mediaType === "company")).toEqual([
      { id: 49, mediaType: "network", name: "HBO", posterPath: "/n.png", subtitle: null },
      { id: 3268, mediaType: "company", name: "HBO", posterPath: "/hbo.png", subtitle: null },
    ]);
  });

  it("searches TMDb without a trailing year hint", async () => {
    await getSearchSuggestions("dune 2021", null);
    expect(searchMulti).toHaveBeenCalledWith("dune");
  });

  it("leaves status off when there's no library owner", async () => {
    const results = await getSearchSuggestions("matrix", null);
    expect(getLibraryStatusMap).not.toHaveBeenCalled();
    expect(results.every((r) => !("status" in r))).toBe(true);
  });

  it("still returns suggestions when the status lookup fails", async () => {
    getLibraryStatusMap.mockRejectedValue(new Error("db down"));
    const results = await getSearchSuggestions("matrix", "owner-1");
    expect(results).toHaveLength(4);
    expect(results.every((r) => !("status" in r))).toBe(true);
  });

  it("skips TMDb and the lookup for queries under two characters", async () => {
    expect(await getSearchSuggestions(" m ", "owner-1")).toEqual([]);
    expect(searchMulti).not.toHaveBeenCalled();
    expect(getLibraryStatusMap).not.toHaveBeenCalled();
  });
});

describe("wantsCompanies", () => {
  it("reads ?include=", () => {
    expect(wantsCompanies(null)).toBe(false);
    expect(wantsCompanies("company,network")).toBe(true);
    expect(wantsCompanies(" Network ")).toBe(true);
    expect(wantsCompanies("all")).toBe(true);
    expect(wantsCompanies("people")).toBe(false);
  });
});

describe("suggestion groups", () => {
  it("puts studios and networks in one group and ignores unknown kinds", () => {
    expect(suggestionGroup("network")).toBe("company");
    expect(suggestionGroup("company")).toBe("company");
    expect(suggestionGroup("collection")).toBeNull();
  });

  it("splits the flat list into labelled runs, keeping flat indexes for ↑↓", () => {
    const runs = groupRuns([
      { mediaType: "movie" },
      { mediaType: "movie" },
      { mediaType: "tv" },
      { mediaType: "collection" },
      { mediaType: "person" },
      { mediaType: "network" },
      { mediaType: "company" },
    ]);
    expect(runs.map((r) => [r.group, r.items.map((i) => i.index)])).toEqual([
      ["movie", [0, 1]],
      ["tv", [2]],
      ["person", [4]],
      ["company", [5, 6]],
    ]);
  });
});
