import { plexHeaders } from "@/lib/plex/client";
import type { MediaType } from "@/lib/db/schema";

// Reading a member's own Plex Watchlist (lib/plex/watchlist.ts does the
// requesting). The fetch is thin; the parsing is pure and unit tested
// (watchlist-api.test.ts).

/** plex.tv's Discover service, which holds watchlists — the host Seerr,
 * Sonarr and python-plexapi all read them from. */
const DISCOVER_BASE = "https://discover.provider.plex.tv";
const REQUEST_TIMEOUT_MS = 10_000;
/** The newest this many titles are read each time. A watchlist is added to
 * at the top, so anything new is always in here. */
export const WATCHLIST_PAGE_SIZE = 100;

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

export async function fetchWatchlist(clientId: string, token: string, etag: string | null): Promise<WatchlistFetch> {
  const params = new URLSearchParams({
    includeGuids: "1",
    includeFields: "title,type,year,ratingKey",
    excludeElements: "Image",
    sort: "watchlistedAt:desc",
    "X-Plex-Container-Start": "0",
    "X-Plex-Container-Size": String(WATCHLIST_PAGE_SIZE),
  });
  const res = await fetch(`${DISCOVER_BASE}/library/sections/watchlist/all?${params}`, {
    headers: { ...plexHeaders(clientId, token), ...(etag ? { "If-None-Match": etag } : {}) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: "manual",
  });
  if (res.status === 304) return { status: "unchanged" };
  if (res.status === 401 || res.status === 403) return { status: "unauthorized" };
  if (!res.ok) throw new Error(`Failed to read the Plex Watchlist (${res.status})`);
  // plex.tv answers some blocked networks with an HTML page and a 200.
  if (!(res.headers.get("content-type") ?? "").includes("json")) {
    throw new Error("Plex sent something other than a watchlist");
  }
  return { status: "ok", etag: res.headers.get("etag"), items: parseWatchlist(await res.json()) };
}
