// Trakt list links — pure, so both the client and the shelf validation
// (lib/discover/shelves.ts) can use it and it's unit tested.
//
// A pasted link is only ever *parsed* here, never fetched: the server reads
// the list from Trakt's own API host (lib/trakt/client.ts), built from the
// username and slug alone, so a link can't point Marquee anywhere else.

export type ParsedTraktUrl =
  | { kind: "list"; username: string; slug: string }
  | { kind: "watchlist"; username: string };

/** Trakt usernames and list slugs as they appear in its URLs. */
const SEGMENT = /^[A-Za-z0-9._~-]{1,100}$/;

function segment(value: string | undefined): string | null {
  if (!value) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (decoded === "." || decoded === "..") return null;
  return SEGMENT.test(decoded) ? decoded : null;
}

/** Accepts the URL a user would actually copy out of their browser, e.g.
 * https://trakt.tv/users/someone/lists/best-of-2024 or
 * https://trakt.tv/users/someone/watchlist — not Trakt's own API paths. */
export function parseTraktUrl(url: string): ParsedTraktUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.username || parsed.password || parsed.port) return null;
  if (!/(^|\.)trakt\.tv$/.test(parsed.hostname)) return null;

  const parts = parsed.pathname.split("/").filter(Boolean);
  // ["users", "<username>", "watchlist"] or ["users", "<username>", "lists", "<slug>"]
  if (parts[0] !== "users") return null;
  const username = segment(parts[1]);
  if (!username) return null;

  if (parts[2] === "watchlist") return { kind: "watchlist", username };
  if (parts[2] === "lists") {
    const slug = segment(parts[3]);
    if (slug) return { kind: "list", username, slug };
  }
  return null;
}
