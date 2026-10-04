// Recent searches, and the last search to bring back when the viewer comes
// back to the search page — both kept in the browser only.
//
// Recent searches: the last few things searched for on this device, newest
// first, shown under an empty search box to search again with a tap. The
// last search: what was typed and its suggestions when a suggestion was
// picked, so swiping back from that title lands on the same open list
// instead of an empty box.

import { normalizeName } from "@/lib/search/rank";

export const RECENT_SEARCH_LIMIT = 8;
const RECENT_KEY = "marquee.recentSearches";
const LAST_KEY = "marquee.lastSearch";

/** The query added to the front; the same query typed differently ("Wall-E"
 * and "wall-e") is moved up rather than kept twice. Blank is ignored. */
export function addRecentSearch(list: readonly string[], query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [...list];
  const key = normalizeName(trimmed) || trimmed.toLowerCase();
  const rest = list.filter((item) => (normalizeName(item) || item.toLowerCase()) !== key);
  return [trimmed, ...rest].slice(0, RECENT_SEARCH_LIMIT);
}

export function removeRecentSearch(list: readonly string[], query: string): string[] {
  return list.filter((item) => item !== query);
}

/** What storage held, or [] for anything that isn't a list of strings. */
export function parseRecentSearches(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, RECENT_SEARCH_LIMIT);
  } catch {
    return [];
  }
}

export function readRecentSearches(): string[] {
  try {
    return parseRecentSearches(localStorage.getItem(RECENT_KEY));
  } catch {
    return [];
  }
}

export function saveRecentSearches(list: readonly string[]) {
  try {
    if (list.length === 0) localStorage.removeItem(RECENT_KEY);
    else localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Storage blocked: there are just no recent searches.
  }
}

/** Adds a search to this device's recent searches. */
export function rememberSearch(query: string): string[] {
  const next = addRecentSearch(readRecentSearches(), query);
  saveRecentSearches(next);
  return next;
}

export type LastSearch<S> = { query: string; suggestions: S[] };

/** Kept for this tab only (sessionStorage), like the back button's history. */
export function saveLastSearch<S>(last: LastSearch<S>) {
  try {
    sessionStorage.setItem(LAST_KEY, JSON.stringify(last));
  } catch {
    // Storage blocked: coming back shows an empty box, as before.
  }
}

export function readLastSearch<S>(): LastSearch<S> | null {
  try {
    const raw = sessionStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastSearch<S>>;
    if (typeof parsed.query !== "string" || !parsed.query.trim() || !Array.isArray(parsed.suggestions)) return null;
    return { query: parsed.query, suggestions: parsed.suggestions };
  } catch {
    return null;
  }
}

// When the browser last went back or forward. The search page only brings
// the last search back when it was reached that way — the Search tab itself
// still opens an empty box (with the recent searches under it).
let lastHistoryNavigationAt = 0;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    lastHistoryNavigationAt = Date.now();
  });
}

/** Whether this page was just reached with back/forward. */
export function cameBackJustNow(now = Date.now()): boolean {
  return now - lastHistoryNavigationAt < 3000;
}
