import { beforeEach, describe, expect, it, vi } from "vitest";

const searchMulti = vi.fn();
const getLibraryStatusMap = vi.fn();

vi.mock("@/lib/tmdb/client", () => ({ searchMulti: (...args: unknown[]) => searchMulti(...args) }));
vi.mock("@/lib/library/query", () => ({
  getLibraryStatusMap: (...args: unknown[]) => getLibraryStatusMap(...args),
}));

const { getSearchSuggestions } = await import("./suggest");

const RESULTS = [
  { id: 603, media_type: "movie", title: "The Matrix", poster_path: "/m.jpg", release_date: "1999-03-31" },
  { id: 6384, media_type: "person", name: "Keanu Reeves", profile_path: "/k.jpg", known_for_department: "Acting" },
  { id: 1399, media_type: "tv", name: "Game of Thrones", poster_path: "/g.jpg", first_air_date: "2011-04-17" },
  { id: 604, media_type: "movie", title: "The Matrix Reloaded", poster_path: null, release_date: "2003-05-15" },
];

beforeEach(() => {
  searchMulti.mockReset().mockResolvedValue({ results: RESULTS });
  getLibraryStatusMap.mockReset();
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
      { mediaType: "tv", tmdbId: 1399 },
      { mediaType: "movie", tmdbId: 604 },
    ]);
    expect(results.map((r) => [r.id, r.status])).toEqual([
      [603, "owned"],
      [6384, undefined],
      [1399, "tracked_downloading"],
      [604, "untracked"],
    ]);
    expect(results[1]).not.toHaveProperty("status");
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
