const TRAKT_API_BASE = "https://api.trakt.tv";

export type TraktConfig = { clientId: string };

async function traktFetch<T>(config: TraktConfig, path: string): Promise<T> {
  const res = await fetch(`${TRAKT_API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": config.clientId,
    },
  });

  if (!res.ok) {
    throw new Error(`Trakt request failed: ${path} (${res.status})`);
  }

  return res.json() as Promise<T>;
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

/** A user's own custom list — only works if that list's privacy is set to
 * public on Trakt's end; there's no OAuth here to read a private one. */
export function getListItems(
  config: TraktConfig,
  username: string,
  listSlug: string,
): Promise<TraktListItem[]> {
  return traktFetch<TraktListItem[]>(
    config,
    `/users/${encodeURIComponent(username)}/lists/${encodeURIComponent(listSlug)}/items/movies,shows`,
  );
}

/** Same public-only caveat as getListItems — the user must have made their
 * watchlist public in Trakt's privacy settings. */
export function getWatchlistItems(config: TraktConfig, username: string): Promise<TraktListItem[]> {
  return traktFetch<TraktListItem[]>(
    config,
    `/users/${encodeURIComponent(username)}/watchlist/movies,shows`,
  );
}

export type ParsedTraktUrl =
  | { kind: "list"; username: string; slug: string }
  | { kind: "watchlist"; username: string };

/** Accepts the URL a user would actually copy out of their browser, e.g.
 * https://trakt.tv/users/someone/lists/best-of-2024 or
 * https://trakt.tv/users/someone/watchlist — not Trakt's own API paths. */
export function parseTraktUrl(url: string): ParsedTraktUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)trakt\.tv$/.test(parsed.hostname)) return null;

  const parts = parsed.pathname.split("/").filter(Boolean);
  // ["users", "<username>", "watchlist"] or ["users", "<username>", "lists", "<slug>"]
  if (parts[0] !== "users" || !parts[1]) return null;

  if (parts[2] === "watchlist") return { kind: "watchlist", username: parts[1] };
  if (parts[2] === "lists" && parts[3]) return { kind: "list", username: parts[1], slug: parts[3] };
  return null;
}
