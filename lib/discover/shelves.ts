// The Discover page's customisable rows — pure and dependency-free, so the
// rules (what a custom shelf may be, how the admin's order is applied, what
// the defaults are) are unit tested directly. The database side is
// lib/discover/layout.ts; the fetching, lib/discover/custom-shelves.ts.

import { DISCOVER_SHELF_KEYS, type DiscoverShelfKey } from "@/lib/discover/lists";
import { parseTraktUrl } from "@/lib/trakt/url";

/** Every built-in shelf's name, as the website has always shown it. */
export const BUILT_IN_SHELF_TITLES: Record<DiscoverShelfKey, string> = {
  recentlyAdded: "Recently Added",
  trending: "Trending",
  popularMovies: "Popular Movies",
  movieGenres: "Movie Genres",
  upcomingMovies: "Upcoming Movies",
  studios: "Studios",
  popularSeries: "Popular Series",
  seriesGenres: "Series Genres",
  upcomingSeries: "Upcoming Series",
  networks: "Networks",
};

export function isBuiltInShelf(value: string): value is DiscoverShelfKey {
  return (DISCOVER_SHELF_KEYS as readonly string[]).includes(value);
}

/** What an admin's own shelf can be built from. */
export const CUSTOM_SHELF_KINDS = ["keyword", "genre", "company", "network", "tmdbList", "traktList", "library"] as const;
export type CustomShelfKind = (typeof CUSTOM_SHELF_KINDS)[number];

export function isCustomShelfKind(value: unknown): value is CustomShelfKind {
  return typeof value === "string" && (CUSTOM_SHELF_KINDS as readonly string[]).includes(value);
}

/** Movies, series, or both mixed. */
export type ShelfMediaType = "movie" | "tv" | "all";

/**
 * Where a custom shelf's titles come from, in one flat shape for every kind
 * (so typed clients decode one struct):
 * - keyword: `tmdbId` = TMDb keyword id, `name` its name, `mediaType`
 * - genre: `tmdbId` = TMDb genre id, `name`, `mediaType` "movie" or "tv"
 * - company: `tmdbId` = TMDb company (studio) id, `name`, `mediaType`
 * - network: `tmdbId` = TMDb network id, `name`; always "tv"
 * - tmdbList: `tmdbId` = TMDb list id, `name` the list's name
 * - traktList: `url` = a public Trakt list or watchlist
 * - library: `mediaType` — what was added to the Plex/Jellyfin library
 */
export type ShelfSource = {
  mediaType: ShelfMediaType | null;
  tmdbId: number | null;
  name: string | null;
  url: string | null;
};

export const MAX_CUSTOM_SHELVES = 30;
export const MAX_SHELF_TITLE_LENGTH = 60;
const MAX_SOURCE_NAME_LENGTH = 120;

export type ShelfInput = { kind: CustomShelfKind; title: string; source: ShelfSource };
export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

const KIND_LABELS: Record<CustomShelfKind, string> = {
  keyword: "keyword",
  genre: "genre",
  company: "studio",
  network: "network",
  tmdbList: "TMDb list",
  traktList: "Trakt list",
  library: "recently added",
};

function positiveId(value: unknown): number | null {
  const n = typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : null;
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

function mediaTypeOf(value: unknown, allowed: readonly ShelfMediaType[], fallback: ShelfMediaType): ShelfMediaType | "bad" {
  if (value === undefined || value === null || value === "") return fallback;
  return allowed.includes(value as ShelfMediaType) ? (value as ShelfMediaType) : "bad";
}

/** "https://www.themoviedb.org/list/8136-star-wars" or "8136" → 8136. */
export function parseTmdbListId(value: unknown): number | null {
  const direct = positiveId(value);
  if (direct) return direct;
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!/(^|\.)themoviedb\.org$/.test(url.hostname)) return null;
  const match = url.pathname.match(/^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?list\/(\d+)/);
  return match ? positiveId(match[1]) : null;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The name a shelf gets when the admin doesn't give one. */
export function defaultShelfTitle(kind: CustomShelfKind, source: ShelfSource): string {
  const name = source.name;
  switch (kind) {
    case "keyword":
      return name ? capitalise(name) : "Keyword";
    case "genre":
      return `${name ?? "Genre"} ${source.mediaType === "tv" ? "Series" : "Movies"}`;
    case "company":
    case "network":
      return name ?? (kind === "company" ? "Studio" : "Network");
    case "tmdbList":
      return name ?? "TMDb list";
    case "traktList": {
      const parsed = source.url ? parseTraktUrl(source.url) : null;
      if (!parsed) return "Trakt list";
      return parsed.kind === "watchlist" ? `${parsed.username}'s watchlist` : capitalise(parsed.slug.replace(/-/g, " "));
    }
    case "library":
      return source.mediaType === "movie"
        ? "Recently Added Movies"
        : source.mediaType === "tv"
          ? "Recently Added Series"
          : "Recently Added";
  }
}

/** A new custom shelf from a client: `{ kind, title?, mediaType?, tmdbId?,
 * name?, url? }`. Checks the shape only — whether the keyword or list exists
 * is TMDb's to say (lib/discover/layout.ts looks names up). */
export function validateShelfInput(body: Record<string, unknown>): Validated<ShelfInput> {
  const kind = body.kind;
  if (!isCustomShelfKind(kind)) {
    return { ok: false, error: `Pick what the row shows: one of ${CUSTOM_SHELF_KINDS.join(", ")}.` };
  }
  const source = validateSource(kind, body);
  if (!source.ok) return source;
  const title = validateTitle(body.title, kind, source.value);
  if (!title.ok) return title;
  return { ok: true, value: { kind, title: title.value, source: source.value } };
}

export function validateTitle(value: unknown, kind: CustomShelfKind, source: ShelfSource): Validated<string> {
  if (value !== undefined && value !== null && typeof value !== "string") {
    return { ok: false, error: "The row's name must be text." };
  }
  const title = cleanText(value, Number.MAX_SAFE_INTEGER);
  if (title && title.length > MAX_SHELF_TITLE_LENGTH) {
    return { ok: false, error: `Keep the row's name under ${MAX_SHELF_TITLE_LENGTH} characters.` };
  }
  return { ok: true, value: title ?? defaultShelfTitle(kind, source) };
}

export function validateSource(kind: CustomShelfKind, body: Record<string, unknown>): Validated<ShelfSource> {
  const name = cleanText(body.name, MAX_SOURCE_NAME_LENGTH);
  const label = KIND_LABELS[kind];

  if (kind === "library") {
    const mediaType = mediaTypeOf(body.mediaType, ["movie", "tv", "all"], "all");
    if (mediaType === "bad") return { ok: false, error: 'mediaType is "movie", "tv" or "all".' };
    return { ok: true, value: { mediaType, tmdbId: null, name: null, url: null } };
  }

  if (kind === "traktList") {
    const raw = typeof body.url === "string" ? body.url.trim() : "";
    const parsed = raw ? parseTraktUrl(raw) : null;
    if (!parsed) {
      return {
        ok: false,
        error: "Paste a public Trakt list or watchlist link, like https://trakt.tv/users/someone/lists/favourites.",
      };
    }
    return { ok: true, value: { mediaType: "all", tmdbId: null, name: null, url: canonicalTraktUrl(parsed) } };
  }

  if (kind === "tmdbList") {
    const tmdbId = parseTmdbListId(body.tmdbId ?? body.url);
    if (!tmdbId) return { ok: false, error: "Give the TMDb list's number or its themoviedb.org/list link." };
    return { ok: true, value: { mediaType: "all", tmdbId, name, url: null } };
  }

  const tmdbId = positiveId(body.tmdbId);
  if (!tmdbId) return { ok: false, error: `Pick a ${label}.` };

  if (kind === "network") return { ok: true, value: { mediaType: "tv", tmdbId, name, url: null } };
  if (kind === "genre") {
    const mediaType = mediaTypeOf(body.mediaType, ["movie", "tv"], "movie");
    if (mediaType === "bad") return { ok: false, error: 'A genre row is "movie" or "tv".' };
    return { ok: true, value: { mediaType, tmdbId, name, url: null } };
  }
  const mediaType = mediaTypeOf(body.mediaType, ["movie", "tv", "all"], "all");
  if (mediaType === "bad") return { ok: false, error: 'mediaType is "movie", "tv" or "all".' };
  return { ok: true, value: { mediaType, tmdbId, name, url: null } };
}

export function canonicalTraktUrl(parsed: NonNullable<ReturnType<typeof parseTraktUrl>>): string {
  const user = encodeURIComponent(parsed.username);
  return parsed.kind === "watchlist"
    ? `https://trakt.tv/users/${user}/watchlist`
    : `https://trakt.tv/users/${user}/lists/${encodeURIComponent(parsed.slug)}`;
}

/** A stored source read back — null when it's not one this version
 * understands (the row then shows nothing, but can still be removed). */
export function parseStoredSource(kind: string, stored: unknown): ShelfSource | null {
  if (!isCustomShelfKind(kind) || !stored || typeof stored !== "object") return null;
  const result = validateSource(kind, stored as Record<string, unknown>);
  return result.ok ? result.value : null;
}

// ── Layout ─────────────────────────────────────────────────────────────────

/** One row of discover_shelves, as far as the layout cares. */
export type ShelfRow = {
  id: string;
  builtIn: string | null;
  kind: string;
  title: string | null;
  source: unknown;
  position: number;
  hidden: boolean;
};

/** A shelf in the admin's order. `id` is the built-in key ("trending") or
 * the custom shelf's uuid. */
export type LayoutShelf = {
  id: string;
  kind: string;
  title: string;
  custom: boolean;
  hidden: boolean;
  source: ShelfSource | null;
};

/** Today's Discover, exactly: every built-in shelf, in page order, shown. */
export function defaultLayout(): LayoutShelf[] {
  return DISCOVER_SHELF_KEYS.map((key) => ({
    id: key,
    kind: key,
    title: BUILT_IN_SHELF_TITLES[key],
    custom: false,
    hidden: false,
    source: null,
  }));
}

/** The stored rows in the admin's order, with any built-in shelf that has
 * no row (none yet, or one added in an update) in its default place when
 * nothing is stored, or else at the end. A row for a built-in shelf this
 * version doesn't have is left out. */
export function resolveLayout(rows: ShelfRow[]): LayoutShelf[] {
  const sorted = [...rows].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const shelves: LayoutShelf[] = [];
  const seen = new Set<string>();
  for (const row of sorted) {
    if (row.builtIn !== null) {
      if (!isBuiltInShelf(row.builtIn) || seen.has(row.builtIn)) continue;
      seen.add(row.builtIn);
      shelves.push({
        id: row.builtIn,
        kind: row.builtIn,
        title: BUILT_IN_SHELF_TITLES[row.builtIn],
        custom: false,
        hidden: row.hidden,
        source: null,
      });
      continue;
    }
    const source = parseStoredSource(row.kind, row.source);
    shelves.push({
      id: row.id,
      kind: row.kind,
      title: row.title ?? (isCustomShelfKind(row.kind) && source ? defaultShelfTitle(row.kind, source) : "Row"),
      custom: true,
      hidden: row.hidden,
      source,
    });
  }
  for (const shelf of defaultLayout()) {
    if (!seen.has(shelf.id)) shelves.push(shelf);
  }
  return shelves;
}

/** The admin's new order: `[{ id, hidden? }, …]`. Every id must be a shelf
 * that exists, each once; a shelf left out keeps its visibility and goes
 * after the ones sent, in its current order (so a client that doesn't know
 * about a newer shelf can't lose it). */
export function applyLayoutOrder(
  current: LayoutShelf[],
  requested: unknown,
): Validated<{ id: string; hidden: boolean }[]> {
  if (!Array.isArray(requested) || requested.length === 0) {
    return { ok: false, error: 'Send "shelves": the rows in order, as [{ "id": "...", "hidden": false }, ...].' };
  }
  const byId = new Map(current.map((shelf) => [shelf.id, shelf]));
  const order: { id: string; hidden: boolean }[] = [];
  const seen = new Set<string>();
  for (const entry of requested) {
    const id = typeof entry === "string" ? entry : entry && typeof entry === "object" ? (entry as { id?: unknown }).id : null;
    if (typeof id !== "string" || !byId.has(id)) {
      return { ok: false, error: `There's no Discover row "${String(id)}". Reload and try again.` };
    }
    if (seen.has(id)) return { ok: false, error: `The row "${id}" is in the list twice.` };
    seen.add(id);
    const hidden = entry && typeof entry === "object" ? (entry as { hidden?: unknown }).hidden : undefined;
    if (hidden !== undefined && typeof hidden !== "boolean") {
      return { ok: false, error: '"hidden" is true or false.' };
    }
    order.push({ id, hidden: typeof hidden === "boolean" ? hidden : byId.get(id)!.hidden });
  }
  for (const shelf of current) {
    if (!seen.has(shelf.id)) order.push({ id: shelf.id, hidden: shelf.hidden });
  }
  return { ok: true, value: order };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isShelfUuid(value: string): boolean {
  return UUID.test(value);
}
