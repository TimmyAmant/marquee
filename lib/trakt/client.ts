import { parseTraktUrl, type ParsedTraktUrl } from "@/lib/trakt/url";

export { parseTraktUrl, type ParsedTraktUrl };

// Only ever this host: pasted links are parsed into a username and slug
// (lib/trakt/url.ts) and the request is built from those, never from the link.
const TRAKT_API_BASE = "https://api.trakt.tv";

// A slow/unreachable Trakt hangs the import sync far longer than a normal
// request should — matches the timeout Radarr/Sonarr/Plex/etc. already set.
const REQUEST_TIMEOUT_MS = 8000;

export type TraktConfig = { clientId: string };

type FetchOptions = {
  /** Seconds the response may be served from Next's fetch cache (a Discover
   * row); omitted for a fresh read (the sync job). */
  revalidate?: number;
};

async function traktRequest(config: TraktConfig, path: string, options: FetchOptions = {}): Promise<Response> {
  const res = await fetch(`${TRAKT_API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": config.clientId,
    },
    // Never followed somewhere else.
    redirect: "error",
    ...(options.revalidate ? { next: { revalidate: options.revalidate } } : { cache: "no-store" as const }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Trakt request failed: ${path} (${res.status})`);
  }
  return res;
}

async function traktFetch<T>(config: TraktConfig, path: string, options: FetchOptions = {}): Promise<T> {
  return (await traktRequest(config, path, options)).json() as Promise<T>;
}

/** Trakt client ids don't have a dedicated "verify" endpoint — any public,
 * unauthenticated GET confirms the key is accepted by Trakt at all. */
export async function verifyTraktClientId(clientId: string): Promise<boolean> {
  return traktFetch<unknown[]>({ clientId }, "/movies/trending?limit=1")
    .then(() => true)
    .catch(() => false);
}

export interface TraktListItem {
  type: "movie" | "show";
  movie?: { title: string; year: number | null; ids: { tmdb: number | null } };
  show?: { title: string; year: number | null; ids: { tmdb: number | null } };
}

function itemsPath(list: ParsedTraktUrl): string {
  const user = encodeURIComponent(list.username);
  return list.kind === "watchlist"
    ? `/users/${user}/watchlist/movies,shows`
    : `/users/${user}/lists/${encodeURIComponent(list.slug)}/items/movies,shows`;
}

/** A user's own custom list — only works if that list's privacy is set to
 * public on Trakt's end; there's no OAuth here to read a private one. */
export function getListItems(
  config: TraktConfig,
  username: string,
  listSlug: string,
): Promise<TraktListItem[]> {
  return traktFetch<TraktListItem[]>(config, itemsPath({ kind: "list", username, slug: listSlug }));
}

/** Same public-only caveat as getListItems — the user must have made their
 * watchlist public in Trakt's privacy settings. */
export function getWatchlistItems(config: TraktConfig, username: string): Promise<TraktListItem[]> {
  return traktFetch<TraktListItem[]>(config, itemsPath({ kind: "watchlist", username }));
}

/** A whole public list or watchlist, fresh (the sync job). */
export function getTraktItems(config: TraktConfig, list: ParsedTraktUrl): Promise<TraktListItem[]> {
  return traktFetch<TraktListItem[]>(config, itemsPath(list));
}

export type TraktItemsPage = { items: TraktListItem[]; pageCount: number; itemCount: number };

/** One page of a public list or watchlist (a Discover row and its See all),
 * from Next's fetch cache for an hour like the TMDb rows. */
export async function getTraktItemsPage(
  config: TraktConfig,
  list: ParsedTraktUrl,
  page: number,
  limit: number,
): Promise<TraktItemsPage> {
  const res = await traktRequest(config, `${itemsPath(list)}?page=${page}&limit=${limit}`, { revalidate: 3600 });
  const items = (await res.json()) as TraktListItem[];
  const header = (name: string) => {
    const value = Number(res.headers.get(name));
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  return {
    items,
    pageCount: header("x-pagination-page-count") ?? (items.length < limit ? page : page + 1),
    itemCount: header("x-pagination-item-count") ?? items.length,
  };
}
