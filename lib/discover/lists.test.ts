import { describe, it, expect } from "vitest";
import {
  DISCOVER_LISTS,
  DISCOVER_SEE_ALL,
  DISCOVER_SHELF_KEYS,
  RECENTLY_ADDED_MAX_PAGE,
  RECENTLY_ADDED_PAGE_SIZE,
  discoverListMaxPage,
  listTmdbPages,
  listTotalPages,
  parseDiscoverList,
  seeAllHref,
  sliceRecentlyAdded,
} from "./lists";

describe("Discover See all targets", () => {
  it("gives every shelf a See all", () => {
    expect(Object.keys(DISCOVER_SEE_ALL).sort()).toEqual([...DISCOVER_SHELF_KEYS].sort());
  });

  it("opens the lists for shelves without a browse page", () => {
    expect(DISCOVER_SEE_ALL.trending).toEqual({ type: "list", list: "trending", mediaType: null });
    expect(DISCOVER_SEE_ALL.recentlyAdded.list).toBe("recently-added");
    expect(DISCOVER_SEE_ALL.upcomingMovies.list).toBe("upcoming-movies");
    expect(DISCOVER_SEE_ALL.upcomingSeries.list).toBe("upcoming-series");
  });

  it("keeps Popular, the genres and the logos on the Movies/Series grid", () => {
    for (const key of ["popularMovies", "movieGenres", "studios"] as const) {
      expect(DISCOVER_SEE_ALL[key]).toEqual({ type: "browse", list: null, mediaType: "movie" });
    }
    for (const key of ["popularSeries", "seriesGenres", "networks"] as const) {
      expect(DISCOVER_SEE_ALL[key]).toEqual({ type: "browse", list: null, mediaType: "tv" });
    }
  });

  it("maps targets to website pages", () => {
    expect(seeAllHref(DISCOVER_SEE_ALL.trending)).toBe("/discover/trending");
    expect(seeAllHref(DISCOVER_SEE_ALL.popularMovies)).toBe("/movies");
    expect(seeAllHref(DISCOVER_SEE_ALL.networks)).toBe("/series");
  });

  it("only points at lists the endpoint serves", () => {
    for (const target of Object.values(DISCOVER_SEE_ALL)) {
      if (target.type === "list") expect(DISCOVER_LISTS).toContain(target.list);
    }
  });
});

describe("Discover list paging", () => {
  it("parses list names strictly", () => {
    expect(parseDiscoverList("trending")).toBe("trending");
    expect(parseDiscoverList("Trending")).toBeNull();
    expect(parseDiscoverList("popular-movies")).toBeNull();
    expect(parseDiscoverList(undefined)).toBeNull();
  });

  it("walks TMDb two pages at a time, never past page 500", () => {
    expect(listTmdbPages(1)).toEqual([1, 2]);
    expect(listTmdbPages(3)).toEqual([5, 6]);
    expect(listTmdbPages(250)).toEqual([499, 500]);
    expect(discoverListMaxPage("trending")).toBe(250);
  });

  it("counts list pages from TMDb's total_pages", () => {
    expect(listTotalPages(0)).toBe(1);
    expect(listTotalPages(1)).toBe(1);
    expect(listTotalPages(3)).toBe(2);
    expect(listTotalPages(10_000)).toBe(250);
  });

  it("slices Recently Added and looks one page ahead", () => {
    const rows = Array.from({ length: RECENTLY_ADDED_PAGE_SIZE + 1 }, (_, i) => i);
    const first = sliceRecentlyAdded(rows, 1);
    expect(first.items).toHaveLength(RECENTLY_ADDED_PAGE_SIZE);
    expect(first.totalPages).toBe(2);

    const all = Array.from({ length: RECENTLY_ADDED_PAGE_SIZE + 5 }, (_, i) => i);
    const second = sliceRecentlyAdded(all, 2);
    expect(second.items).toEqual([40, 41, 42, 43, 44]);
    expect(second.totalPages).toBe(2);
    expect(second.totalResults).toBe(45);
  });

  it("reports one page for an empty library", () => {
    expect(sliceRecentlyAdded([], 1)).toEqual({ items: [], totalPages: 1, totalResults: 0 });
  });

  it("stops at the Recently Added page cap", () => {
    const rows = Array.from({ length: RECENTLY_ADDED_MAX_PAGE * RECENTLY_ADDED_PAGE_SIZE + 1 }, (_, i) => i);
    expect(sliceRecentlyAdded(rows, RECENTLY_ADDED_MAX_PAGE).totalPages).toBe(RECENTLY_ADDED_MAX_PAGE);
  });
});
