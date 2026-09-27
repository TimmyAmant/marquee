import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/lib/library/query";
import {
  DEFAULT_PAGE_SIZE,
  filterLibrary,
  libraryFilterOptions,
  libraryQueryParams,
  libraryResolution,
  pageLibrary,
  parseLibraryQuery,
  queryLibrary,
  sortLibrary,
} from "./list";

// The Library page's filters, sort and paging (pure; the same code behind
// /library and GET /api/v1/library).

let next = 1;
function item(overrides: Partial<LibraryItem> = {}): LibraryItem {
  const tmdbId = overrides.tmdbId ?? next++;
  return {
    titleId: `t${tmdbId}`,
    mediaType: "movie",
    tmdbId,
    tvdbId: null,
    name: `Title ${tmdbId}`,
    posterPath: null,
    year: "2000",
    genres: [],
    rating: null,
    status: "owned",
    source: "plex",
    sizeBytes: null,
    addedAt: null,
    monitored: null,
    arrId: null,
    episodeCount: null,
    filePath: null,
    qualityCutoffNotMet: false,
    qualityName: null,
    resolution: null,
    dynamicRange: null,
    audioCodec: null,
    videoCodec: null,
    possibleDuplicate: false,
    otherFilePath: null,
    ...overrides,
  };
}

const base = { sort: "recent" as const, page: 1, pageSize: DEFAULT_PAGE_SIZE };

describe("libraryResolution", () => {
  it("reads the tier from Radarr's quality profile or the media server", () => {
    expect(libraryResolution(item({ qualityName: "Bluray-2160p" }))).toBe("4K");
    expect(libraryResolution(item({ resolution: "1080p" }))).toBe("1080p");
    expect(libraryResolution(item({ resolution: "1280x720" }))).toBe("720p");
  });

  it("is SD for a known quality below 720p, null when nothing describes a file", () => {
    expect(libraryResolution(item({ qualityName: "DVD" }))).toBe("SD");
    expect(libraryResolution(item({ resolution: "sd" }))).toBe("SD");
    expect(libraryResolution(item())).toBeNull();
  });
});

describe("filterLibrary", () => {
  const items = [
    item({ tmdbId: 1, name: "The Matrix", mediaType: "movie", status: "owned", source: "plex", qualityName: "Bluray-2160p", dynamicRange: "DV", videoCodec: "HEVC", genres: ["Action", "Science Fiction"], year: "1999" }),
    item({ tmdbId: 2, name: "Severance", mediaType: "tv", status: "tracked_downloading", source: "sonarr", genres: ["Drama"], year: "2022" }),
    item({ tmdbId: 3, name: "Heat", mediaType: "movie", status: "tracked_monitored", source: "radarr", resolution: "1080p", dynamicRange: "SDR", videoCodec: "h264", genres: ["Crime", "action"], year: "1995" }),
  ];

  it("passes everything through with no filters", () => {
    expect(filterLibrary(items, base).map((i) => i.tmdbId)).toEqual([1, 2, 3]);
  });

  it("filters by type, status and source", () => {
    expect(filterLibrary(items, { ...base, type: "tv" }).map((i) => i.tmdbId)).toEqual([2]);
    expect(filterLibrary(items, { ...base, status: "tracked_monitored" }).map((i) => i.tmdbId)).toEqual([3]);
    expect(filterLibrary(items, { ...base, source: "plex" }).map((i) => i.tmdbId)).toEqual([1]);
  });

  it("filters by resolution, HDR and codec (case-insensitively)", () => {
    expect(filterLibrary(items, { ...base, resolution: "4K" }).map((i) => i.tmdbId)).toEqual([1]);
    expect(filterLibrary(items, { ...base, resolution: "1080p" }).map((i) => i.tmdbId)).toEqual([3]);
    expect(filterLibrary(items, { ...base, hdr: true }).map((i) => i.tmdbId)).toEqual([1]);
    expect(filterLibrary(items, { ...base, codec: "hevc" }).map((i) => i.tmdbId)).toEqual([1]);
    expect(filterLibrary(items, { ...base, codec: "H264" }).map((i) => i.tmdbId)).toEqual([3]);
  });

  it("filters by genre (case-insensitively), year and title", () => {
    expect(filterLibrary(items, { ...base, genre: "ACTION" }).map((i) => i.tmdbId)).toEqual([1, 3]);
    expect(filterLibrary(items, { ...base, year: 2022 }).map((i) => i.tmdbId)).toEqual([2]);
    expect(filterLibrary(items, { ...base, q: "  heat " }).map((i) => i.tmdbId)).toEqual([3]);
    expect(filterLibrary(items, { ...base, q: "e" }).map((i) => i.tmdbId)).toEqual([1, 2, 3]);
  });

  it("combines filters", () => {
    expect(filterLibrary(items, { ...base, type: "movie", genre: "action", resolution: "1080p" }).map((i) => i.tmdbId)).toEqual([3]);
    expect(filterLibrary(items, { ...base, type: "tv", genre: "action" })).toEqual([]);
  });
});

describe("sortLibrary", () => {
  const items = [
    item({ tmdbId: 1, name: "banana", year: "2001", sizeBytes: 10, rating: 7.1, addedAt: new Date("2026-01-02") }),
    item({ tmdbId: 2, name: "Apple", year: null, sizeBytes: null, rating: 9, addedAt: null }),
    item({ tmdbId: 3, name: "cherry", year: "2010", sizeBytes: 30, rating: null, addedAt: new Date("2026-01-05") }),
    item({ tmdbId: 4, name: "date", year: "2005", sizeBytes: 20, rating: 8, addedAt: null }),
  ];
  const ids = (sort: Parameters<typeof sortLibrary>[1]) => sortLibrary(items, sort).map((i) => i.tmdbId);

  it("sorts titles A–Z ignoring case", () => {
    expect(ids("title")).toEqual([2, 1, 3, 4]);
  });

  it("sorts year, size and rating descending with unknowns last", () => {
    expect(ids("year")).toEqual([3, 4, 1, 2]);
    expect(ids("size")).toEqual([3, 4, 1, 2]);
    expect(ids("rating")).toEqual([2, 4, 1, 3]);
  });

  it("puts the newest media-server additions first, then arr-only rows by year", () => {
    expect(ids("recent")).toEqual([3, 1, 4, 2]);
  });

  it("does not change the input", () => {
    const before = items.map((i) => i.tmdbId);
    sortLibrary(items, "title");
    expect(items.map((i) => i.tmdbId)).toEqual(before);
  });
});

describe("pageLibrary", () => {
  const items = Array.from({ length: 7 }, (_, i) => item({ tmdbId: i + 1 }));

  it("slices pages and reports the totals", () => {
    const page = pageLibrary(items, 2, 3);
    expect(page).toMatchObject({ page: 2, pageSize: 3, totalPages: 3, totalResults: 7 });
    expect(page.results.map((i) => i.tmdbId)).toEqual([4, 5, 6]);
    expect(pageLibrary(items, 3, 3).results.map((i) => i.tmdbId)).toEqual([7]);
  });

  it("clamps a page past the end and an empty library to one page", () => {
    expect(pageLibrary(items, 9, 3)).toMatchObject({ page: 3, totalPages: 3 });
    expect(pageLibrary([], 4, 3)).toMatchObject({ page: 1, totalPages: 1, totalResults: 0, results: [] });
  });

  it("filters, sorts and pages together", () => {
    const page = queryLibrary(items, { ...base, sort: "title", q: "Title", page: 2, pageSize: 5 });
    expect(page.results.map((i) => i.tmdbId)).toEqual([6, 7]);
  });
});

describe("libraryFilterOptions", () => {
  it("lists only what occurs, sorted, with sources in the fixed order", () => {
    const options = libraryFilterOptions([
      item({ source: "sonarr", genres: ["Drama", "action"], videoCodec: "HEVC", year: "2022" }),
      item({ source: "plex", genres: ["Action"], videoCodec: "hevc", year: "1999", qualityName: "Bluray-2160p", dynamicRange: "HDR10" }),
      item({ source: "plex", genres: [], videoCodec: "AV1", year: null, resolution: "480p" }),
    ]);
    expect(options).toEqual({
      sources: ["plex", "sonarr"],
      genres: ["action", "Drama"],
      codecs: ["AV1", "HEVC"],
      years: [2022, 1999],
      resolutions: ["4K", "SD"],
      hasHdr: true,
    });
  });
});

describe("parseLibraryQuery", () => {
  it("fills in the defaults", () => {
    expect(parseLibraryQuery({})).toEqual({ query: { ...base, hdr: undefined }, problem: null });
  });

  it("reads every parameter", () => {
    const { query } = parseLibraryQuery({
      type: "tv",
      status: "owned",
      source: "jellyfin",
      resolution: "SD",
      hdr: "1",
      codec: " HEVC ",
      genre: "Drama",
      year: "2020",
      q: "sev",
      sort: "size",
      page: "3",
      pageSize: "10",
    });
    expect(query).toEqual({
      type: "tv",
      status: "owned",
      source: "jellyfin",
      resolution: "SD",
      hdr: true,
      codec: "HEVC",
      genre: "Drama",
      year: 2020,
      q: "sev",
      sort: "size",
      page: 3,
      pageSize: 10,
    });
  });

  it("ignores bad values when lenient", () => {
    const { query, problem } = parseLibraryQuery({ type: "book", sort: "colour", year: "abc", page: "0", hdr: "maybe" });
    expect(problem).toBeNull();
    expect(query).toMatchObject({ type: undefined, sort: "recent", year: undefined, page: 1, hdr: undefined });
  });

  it("reports the first bad value when strict", () => {
    expect(parseLibraryQuery({ sort: "colour" }, "strict").problem).toEqual({ field: "sort", values: "recent, title, year, size, rating" });
    expect(parseLibraryQuery({ status: "untracked" }, "strict").problem?.field).toBe("status");
    expect(parseLibraryQuery({ year: "99999" }, "strict").problem).toEqual({ field: "year", values: "1800–3000" });
    expect(parseLibraryQuery({ pageSize: "500" }, "strict").problem?.field).toBe("pageSize");
    expect(parseLibraryQuery({ hdr: "maybe" }, "strict").problem?.field).toBe("hdr");
    expect(parseLibraryQuery({ hdr: "false", page: "2" }, "strict")).toEqual({ query: { ...base, hdr: undefined, page: 2 }, problem: null });
  });

  it("round-trips through URL parameters, defaults left out", () => {
    const { query } = parseLibraryQuery({ type: "movie", hdr: "true", sort: "title", page: "2", genre: "Action" });
    expect(libraryQueryParams(query).toString()).toBe("type=movie&hdr=1&genre=Action&sort=title&page=2");
    expect(libraryQueryParams(base).toString()).toBe("");
  });
});
