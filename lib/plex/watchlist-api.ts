import { plexHeaders } from "@/lib/plex/client";
import type { MediaType } from "@/lib/db/schema";

// Reading a member's own Plex Watchlist (lib/plex/watchlist.ts does the
// requesting). The fetch is thin; the parsing is pure and unit tested
// (watchlist-api.test.ts).

/** plex.tv's Discover service, which holds watchlists — the host Seerr,
 * Sonarr and python-plexapi all read them from. */
const DISCOVER_BASE = "https://discover.provider.plex.tv";
const REQUEST_TIMEOUT_MS = 10_000;
/** Titles per request; the whole watchlist is read a page at a time. */
export const WATCHLIST_PAGE_SIZE = 100;
/** Pages read at most (2,000 titles): a bound, not a limit anyone reaches. */
export const WATCHLIST_MAX_PAGES = 20;

export type WatchlistItem = { mediaType: MediaType; tmdbId: number; title: string };

export type WatchlistFetch =
  | { status: "ok"; etag: string | null; items: WatchlistItem[] }
  /** Same ETag as last time: nothing changed. */
  | { status: "unchanged" }
  /** plex.tv refused the token (signed out everywhere, password changed…):
   * a 401, or a 403 for an account no longer allowed a watchlist. */
  | { status: "unauthorized" };

function tmdbIdFrom(guids: unknown): number | null {
  if (!Array.isArray(guids)) return null;
  for (const guid of guids) {
    const id = guid && typeof guid === "object" ? (guid as { id?: unknown }).id : null;
    if (typeof id !== "string") continue;
    const match = /^tmdb:\/\/(\d+)$/.exec(id);
    if (match) {
      const value = Number(match[1]);
      if (Number.isSafeInteger(value) && value > 0) return value;
    }
  }
  return null;
}

/**
 * Parses `GET /library/sections/watchlist/all?includeGuids=1` (JSON): a
 * `MediaContainer` whose `Metadata` entries have `type` ("movie" or
 * "show"), `title`, and — with includeGuids — a `Guid` list like
 * `[{ "id": "imdb://tt…" }, { "id": "tmdb://123" }, { "id": "tvdb://456" }]`.
 * Anything without a TMDB id, or that isn't a movie or show, is left out:
 * there'd be nothing to request.
 */
export function parseWatchlist(body: unknown): WatchlistItem[] {
  const container = body && typeof body === "object" ? (body as { MediaContainer?: unknown }).MediaContainer : null;
  const metadata = container && typeof container === "object" ? (container as { Metadata?: unknown }).Metadata : null;
  if (!Array.isArray(metadata)) return [];
  const items: WatchlistItem[] = [];
  for (const entry of metadata) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const mediaType = raw.type === "movie" ? "movie" : raw.type === "show" ? "tv" : null;
    const tmdbId = tmdbIdFrom(raw.Guid);
    if (!mediaType || !tmdbId) continue;
    const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 200) : "Untitled";
    items.push({ mediaType, tmdbId, title });
  }
  return items;
}

/** Marks an ETag saved from a whole-watchlist read. */
const ETAG_PREFIX = "all:";

/** `MediaContainer.totalSize`: how many titles the whole watchlist holds. */
export function watchlistTotalSize(body: unknown): number | null {
  const container = body && typeof body === "object" ? (body as { MediaContainer?: unknown }).MediaContainer : null;
  const total = container && typeof container === "object" ? (container as { totalSize?: unknown }).totalSize : null;
  const value = typeof total === "string" ? Number(total) : total;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/**
 * The member's whole watchlist, newest first, a page at a time (it used to
 * stop at the newest hundred, so anything older was never requested or
 * shown). The first page's ETag says whether anything changed at all.
 */
export async function fetchWatchlist(clientId: string, token: string, etag: string | null): Promise<WatchlistFetch> {
  // An ETag saved when only the newest hundred were read would answer 304
  // and keep the rest unread: only one saved since (prefixed) is sent.
  const sentEtag = etag?.startsWith(ETAG_PREFIX) ? etag.slice(ETAG_PREFIX.length) : null;
  const items: WatchlistItem[] = [];
  let firstEtag: string | null = null;
  for (let page = 0; page < WATCHLIST_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      includeGuids: "1",
      includeFields: "title,type,year,ratingKey",
      excludeElements: "Image",
      sort: "watchlistedAt:desc",
      "X-Plex-Container-Start": String(page * WATCHLIST_PAGE_SIZE),
      "X-Plex-Container-Size": String(WATCHLIST_PAGE_SIZE),
    });
    const res = await fetch(`${DISCOVER_BASE}/library/sections/watchlist/all?${params}`, {
      headers: { ...plexHeaders(clientId, token), ...(page === 0 && sentEtag ? { "If-None-Match": sentEtag } : {}) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "manual",
    });
    if (page === 0 && res.status === 304) return { status: "unchanged" };
    if (res.status === 401 || res.status === 403) return { status: "unauthorized" };
    if (!res.ok) throw new Error(`Failed to read the Plex Watchlist (${res.status})`);
    // plex.tv answers some blocked networks with an HTML page and a 200.
    if (!(res.headers.get("content-type") ?? "").includes("json")) {
      throw new Error("Plex sent something other than a watchlist");
    }
    if (page === 0) {
      const header = res.headers.get("etag");
      firstEtag = header ? `${ETAG_PREFIX}${header}` : null;
    }
    const body = await res.json();
    const metadata = (body as { MediaContainer?: { Metadata?: unknown[] } })?.MediaContainer?.Metadata;
    items.push(...parseWatchlist(body));
    const total = watchlistTotalSize(body);
    const read = (page + 1) * WATCHLIST_PAGE_SIZE;
    if (!Array.isArray(metadata) || metadata.length < WATCHLIST_PAGE_SIZE || (total !== null && read >= total)) break;
  }
  return { status: "ok", etag: firstEtag, items };
}
