// The Library page's filters, sort and paging over what getUserLibrary
// returns — pure (no database), shared by /library and GET /api/v1/library
// and unit tested directly. The whole library is merged in memory anyway
// (several sources, one row per title), so slicing it here costs nothing
// extra and keeps one definition of every filter.

import type { LibraryStatus } from "@/lib/library/status-tone";
import type { LibraryItem, LibrarySource } from "@/lib/library/query";
import type { MediaType } from "@/lib/db/schema";
import { hdrLabel, resolutionTierOf } from "@/lib/quality";

export const LIBRARY_SORTS = ["recent", "title", "year", "size", "rating"] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

export const LIBRARY_RESOLUTIONS = ["4K", "1080p", "720p", "SD"] as const;
export type LibraryResolution = (typeof LIBRARY_RESOLUTIONS)[number];

export const LIBRARY_SOURCES: readonly LibrarySource[] = ["plex", "jellyfin", "radarr", "sonarr"];

/** The statuses a library row can have (never "untracked": those aren't in
 * the library), in the color key's order. */
export const LIBRARY_STATUS_FILTERS: readonly LibraryStatus[] = [
  "owned",
  "tracked_downloading",
  "tracked_monitored",
  "tracked_unmonitored",
  "coming_soon",
];

export const DEFAULT_PAGE_SIZE = 60;
export const MAX_PAGE_SIZE = 200;

export type LibraryQuery = {
  type?: MediaType;
  status?: LibraryStatus;
  source?: LibrarySource;
  resolution?: LibraryResolution;
  /** Only titles with an HDR/Dolby Vision file. */
  hdr?: boolean;
  /** A video codec as the media server spells it ("HEVC"), matched case-insensitively. */
  codec?: string;
  /** A TMDb genre name, matched case-insensitively. */
  genre?: string;
  year?: number;
  /** Title search, case-insensitive substring. */
  q?: string;
  sort: LibrarySort;
  page: number;
  pageSize: number;
};

export const DEFAULT_LIBRARY_QUERY: LibraryQuery = { sort: "recent", page: 1, pageSize: DEFAULT_PAGE_SIZE };

/** The resolution to filter and show for a row: the tier of its file where
 * one is known, "SD" for a file whose quality is known but below 720p, null
 * when nothing describes the file (a monitored-only title, say). */
export function libraryResolution(item: Pick<LibraryItem, "qualityName" | "resolution">): LibraryResolution | null {
  const tier = resolutionTierOf(item.qualityName, item.resolution);
  if (tier) return tier;
  return item.qualityName || item.resolution ? "SD" : null;
}

/** Whether the row's file is HDR (any flavor) or Dolby Vision. */
export function libraryIsHdr(item: Pick<LibraryItem, "dynamicRange">): boolean {
  return hdrLabel(item.dynamicRange) !== null;
}

function fold(value: string): string {
  return value.trim().toLowerCase();
}

export function filterLibrary(items: readonly LibraryItem[], query: LibraryQuery): LibraryItem[] {
  const q = query.q ? fold(query.q) : "";
  const codec = query.codec ? fold(query.codec) : "";
  const genre = query.genre ? fold(query.genre) : "";
  return items.filter((item) => {
    if (query.type && item.mediaType !== query.type) return false;
    if (query.status && item.status !== query.status) return false;
    if (query.source && item.source !== query.source) return false;
    if (query.resolution && libraryResolution(item) !== query.resolution) return false;
    if (query.hdr && !libraryIsHdr(item)) return false;
    if (codec && fold(item.videoCodec ?? "") !== codec) return false;
    if (genre && !item.genres.some((g) => fold(g) === genre)) return false;
    if (query.year !== undefined && Number(item.year) !== query.year) return false;
    if (q && !fold(item.name).includes(q)) return false;
    return true;
  });
}

function compareTitles(a: LibraryItem, b: LibraryItem): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.tmdbId - b.tmdbId;
}

/** Nulls last for every sort but the title. Ties fall back to the title so
 * paging is stable. */
export function sortLibrary(items: readonly LibraryItem[], sort: LibrarySort): LibraryItem[] {
  const sorted = [...items];
  const desc = (pick: (item: LibraryItem) => number | null) => (a: LibraryItem, b: LibraryItem) => {
    const av = pick(a);
    const bv = pick(b);
    if (av === null && bv === null) return compareTitles(a, b);
    if (av === null) return 1;
    if (bv === null) return -1;
    return bv - av || compareTitles(a, b);
  };
  switch (sort) {
    case "title":
      sorted.sort(compareTitles);
      break;
    case "year":
      sorted.sort(desc((i) => (i.year ? Number(i.year) : null)));
      break;
    case "size":
      sorted.sort(desc((i) => (i.sizeBytes ? i.sizeBytes : null)));
      break;
    case "rating":
      sorted.sort(desc((i) => i.rating));
      break;
    case "recent":
    default:
      // Only media-server rows carry addedAt; arr-only rows go after them,
      // newest release first.
      sorted.sort((a, b) => {
        const at = a.addedAt?.getTime() ?? null;
        const bt = b.addedAt?.getTime() ?? null;
        if (at !== null && bt !== null) return bt - at || compareTitles(a, b);
        if (at !== null) return -1;
        if (bt !== null) return 1;
        const ay = a.year ? Number(a.year) : 0;
        const by = b.year ? Number(b.year) : 0;
        return by - ay || compareTitles(a, b);
      });
  }
  return sorted;
}

export type LibraryPage = {
  page: number;
  pageSize: number;
  totalPages: number;
  totalResults: number;
  results: LibraryItem[];
};

export function pageLibrary(items: readonly LibraryItem[], page: number, pageSize: number): LibraryPage {
  const size = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(pageSize)));
  const totalResults = items.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / size));
  const current = Math.max(1, Math.min(totalPages, Math.floor(page)));
  const start = (current - 1) * size;
  return { page: current, pageSize: size, totalPages, totalResults, results: items.slice(start, start + size) };
}

/** Filter, sort and page in one go. */
export function queryLibrary(items: readonly LibraryItem[], query: LibraryQuery): LibraryPage {
  return pageLibrary(sortLibrary(filterLibrary(items, query), query.sort), query.page, query.pageSize);
}

export type LibraryFilterOptions = {
  /** Sources that actually have titles, in LIBRARY_SOURCES order. */
  sources: LibrarySource[];
  /** Genre names present, A–Z. */
  genres: string[];
  /** Video codecs present, as the media servers spell them, A–Z. */
  codecs: string[];
  /** Release years present, newest first. */
  years: number[];
  /** Resolutions present, best first. */
  resolutions: LibraryResolution[];
  /** Any title with an HDR/DV file. */
  hasHdr: boolean;
};

/** What the filter pickers offer: only values that occur in this library,
 * so a picker never dead-ends on an empty grid. */
export function libraryFilterOptions(items: readonly LibraryItem[]): LibraryFilterOptions {
  const sources = new Set<LibrarySource>();
  const genres = new Map<string, string>();
  const codecs = new Map<string, string>();
  const years = new Set<number>();
  const resolutions = new Set<LibraryResolution>();
  let hasHdr = false;
  for (const item of items) {
    sources.add(item.source);
    for (const genre of item.genres) if (!genres.has(fold(genre))) genres.set(fold(genre), genre);
    if (item.videoCodec && !codecs.has(fold(item.videoCodec))) codecs.set(fold(item.videoCodec), item.videoCodec);
    if (item.year && Number.isFinite(Number(item.year))) years.add(Number(item.year));
    const resolution = libraryResolution(item);
    if (resolution) resolutions.add(resolution);
    if (libraryIsHdr(item)) hasHdr = true;
  }
  return {
    sources: LIBRARY_SOURCES.filter((s) => sources.has(s)),
    genres: [...genres.values()].sort((a, b) => a.localeCompare(b)),
    codecs: [...codecs.values()].sort((a, b) => a.localeCompare(b)),
    years: [...years].sort((a, b) => b - a),
    resolutions: LIBRARY_RESOLUTIONS.filter((r) => resolutions.has(r)),
    hasHdr,
  };
}

// ── Parsing ──────────────────────────────────────────────────────────────────

export type RawLibraryQuery = Partial<Record<"type" | "status" | "source" | "resolution" | "hdr" | "codec" | "genre" | "year" | "q" | "sort" | "page" | "pageSize", string | undefined>>;

export type LibraryQueryProblem = { field: string; values?: string };

function oneOf<T extends string>(values: readonly T[], value: string | undefined): T | undefined {
  return value !== undefined && (values as readonly string[]).includes(value) ? (value as T) : undefined;
}

/**
 * A query from URL parameters. Lenient (the website: an unknown value is
 * simply ignored) or strict (the API: the first bad value is reported so the
 * route can answer 400). Blank values mean "not set".
 */
export function parseLibraryQuery(
  raw: RawLibraryQuery,
  mode: "lenient" | "strict" = "lenient",
): { query: LibraryQuery; problem: LibraryQueryProblem | null } {
  let problem: LibraryQueryProblem | null = null;
  const bad = (field: string, values?: string) => {
    if (mode === "strict" && !problem) problem = { field, values };
  };
  const enumValue = <T extends string>(field: string, values: readonly T[]): T | undefined => {
    const value = raw[field as keyof RawLibraryQuery];
    if (value === undefined || value === "") return undefined;
    const found = oneOf(values, value);
    if (found === undefined) bad(field, values.join(", "));
    return found;
  };
  const intValue = (field: "year" | "page" | "pageSize", min: number, max: number): number | undefined => {
    const value = raw[field];
    if (value === undefined || value === "") return undefined;
    const n = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min || n > max) {
      bad(field, `${min}–${max}`);
      return undefined;
    }
    return n;
  };
  const text = (field: "codec" | "genre" | "q"): string | undefined => {
    const value = raw[field]?.trim();
    return value ? value.slice(0, 100) : undefined;
  };
  const hdrRaw = raw.hdr;
  let hdr: boolean | undefined;
  if (hdrRaw !== undefined && hdrRaw !== "") {
    if (["1", "true"].includes(hdrRaw)) hdr = true;
    else if (["0", "false"].includes(hdrRaw)) hdr = false;
    else bad("hdr", "true, false");
  }

  const query: LibraryQuery = {
    type: enumValue("type", ["movie", "tv"] as const),
    status: enumValue("status", LIBRARY_STATUS_FILTERS),
    source: enumValue("source", LIBRARY_SOURCES),
    resolution: enumValue("resolution", LIBRARY_RESOLUTIONS),
    hdr: hdr || undefined,
    codec: text("codec"),
    genre: text("genre"),
    year: intValue("year", 1800, 3000),
    q: text("q"),
    sort: enumValue("sort", LIBRARY_SORTS) ?? "recent",
    page: intValue("page", 1, 100000) ?? 1,
    pageSize: intValue("pageSize", 1, MAX_PAGE_SIZE) ?? DEFAULT_PAGE_SIZE,
  };
  return { query, problem };
}

/** The query back as URL parameters, defaults left out — what the website's
 * filter bar writes into the address. */
export function libraryQueryParams(query: Partial<LibraryQuery>): URLSearchParams {
  const params = new URLSearchParams();
  if (query.type) params.set("type", query.type);
  if (query.status) params.set("status", query.status);
  if (query.source) params.set("source", query.source);
  if (query.resolution) params.set("resolution", query.resolution);
  if (query.hdr) params.set("hdr", "1");
  if (query.codec) params.set("codec", query.codec);
  if (query.genre) params.set("genre", query.genre);
  if (query.year !== undefined) params.set("year", String(query.year));
  if (query.q) params.set("q", query.q);
  if (query.sort && query.sort !== "recent") params.set("sort", query.sort);
  if (query.page !== undefined && query.page > 1) params.set("page", String(query.page));
  if (query.pageSize !== undefined && query.pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(query.pageSize));
  return params;
}
