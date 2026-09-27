// Pure ranking helpers for search — how the results page and the type-ahead
// order what TMDb sends back. Dependency-free so they can be unit tested.
//
// The order of the sections themselves is fixed (Movies, TV Shows, People,
// Studios & Networks — SEARCH_SECTION_ORDER); these decide the order inside
// each one: an exact name first, then relevance (TMDb's own order) blended
// with popularity, and a year in the query ("dune 2021") lifts that year's
// title to the top.

/** The results page's sections, top to bottom. The type-ahead groups the same way. */
export const SEARCH_SECTION_ORDER = ["movie", "tv", "person", "company"] as const;
export type SearchSectionKind = (typeof SEARCH_SECTION_ORDER)[number];

/** Lowercased, accents and punctuation dropped, "&" → "and", "+" → "plus",
 * so "Disney+" and "disney plus" and "Amélie" and "amelie" compare equal. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export type ParsedQuery = {
  /** The whole query, normalized. */
  full: string;
  /** The query without a trailing year hint ("dune 2021" → "dune"); the
   * same as `full` when there's none. What TMDb gets searched for. */
  text: string;
  /** A year the query ends with ("dune 2021", "dune (1984)"), else null. A
   * year on its own ("1917") is a title, not a hint. */
  year: number | null;
};

export function parseQuery(query: string): ParsedQuery {
  const trimmed = query.trim();
  const match = trimmed.match(/^(.*\S)\s+\(?((?:19|20)\d{2})\)?$/);
  const full = normalizeName(trimmed);
  if (!match) return { full, text: full, year: null };
  const text = normalizeName(match[1]);
  if (!text) return { full, text: full, year: null };
  return { full, text, year: Number(match[2]) };
}

/** The raw text to send TMDb: the query without its year hint. */
export function searchText(query: string): string {
  const trimmed = query.trim();
  const match = trimmed.match(/^(.*\S)\s+\(?((?:19|20)\d{2})\)?$/);
  return match && normalizeName(match[1]) ? match[1].trim() : trimmed;
}

/** How well one name matches the query: 1000 exact, 500 starts with it,
 * 300 has every word of it, 0 otherwise. */
export function nameMatchScore(name: string | null | undefined, q: ParsedQuery): number {
  if (!name) return 0;
  const n = normalizeName(name);
  if (!n) return 0;
  if (n === q.full || n === q.text) return 1000;
  if (q.text && (n.startsWith(`${q.text} `) || n.startsWith(q.text))) return 500;
  const words = q.text.split(" ").filter(Boolean);
  const nameWords = new Set(n.split(" "));
  if (words.length > 0 && words.every((w) => nameWords.has(w))) return 300;
  return 0;
}

/** Popularity as a gentle tiebreaker: 0 → 0, 10 → 52, 100 → 100, 1000+ → 150. */
function popularityScore(popularity: number | null | undefined): number {
  if (!popularity || popularity <= 0) return 0;
  return Math.min(150, Math.log10(1 + popularity) * 50);
}

/** TMDb's own order is relevance: the first result earns the most. */
function relevanceScore(index: number): number {
  return Math.max(0, 60 - index * 3);
}

export type RankableTitle = {
  name: string;
  originalName?: string | null;
  year: string | null;
  popularity?: number | null;
};

export function titleScore(title: RankableTitle, index: number, q: ParsedQuery): number {
  const match = Math.max(nameMatchScore(title.name, q), nameMatchScore(title.originalName, q) - 50);
  const yearHit = q.year !== null && title.year === String(q.year) ? 400 : 0;
  return match + yearHit + popularityScore(title.popularity) + relevanceScore(index);
}

/** Sorts by score, keeping TMDb's order among equals. */
function rankBy<T>(items: readonly T[], score: (item: T, index: number) => number): T[] {
  return items
    .map((item, index) => ({ item, index, score: score(item, index) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

/** Movies or series: exact title first (the year hint's one before other
 * exact matches), then relevance blended with popularity. */
export function rankTitles<T extends RankableTitle>(items: readonly T[], query: string): T[] {
  const q = parseQuery(query);
  return rankBy(items, (item, index) => titleScore(item, index, q));
}

export type RankablePerson = { name: string; popularity?: number | null };

export function rankPeople<T extends RankablePerson>(items: readonly T[], query: string): T[] {
  const q = parseQuery(query);
  return rankBy(items, (item, index) => nameMatchScore(item.name, q) + popularityScore(item.popularity) + relevanceScore(index));
}

export type RankableCompany = { name: string; logoPath: string | null; kind: "studio" | "network" };

/** Studios and networks together: exact name first; a network from
 * Discover's list, and anything with a logo, a little ahead of the rest. */
export function rankCompanies<T extends RankableCompany>(items: readonly T[], query: string): T[] {
  const q = parseQuery(query);
  return rankBy(
    items,
    (item, index) =>
      nameMatchScore(item.name, q) +
      (item.kind === "network" ? 100 : 0) +
      (item.logoPath ? 40 : 0) +
      relevanceScore(index),
  );
}

/** The networks Discover knows whose name (or another name for it — "Max"
 * for HBO) matches the query, best first. TMDb has no network search. */
export function matchNetworks<N extends { id: number; name: string; aliases?: readonly string[] }>(
  networks: readonly N[],
  query: string,
): N[] {
  const q = parseQuery(query);
  if (q.text.length < 2) return [];
  const scored = networks
    .map((network, index) => ({
      network,
      index,
      score: Math.max(...[network.name, ...(network.aliases ?? [])].map((name) => nameMatchScore(name, q))),
    }))
    .filter((entry) => entry.score > 0);
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((entry) => entry.network);
}

/** Whether any name in a list is exactly what was searched for. */
export function hasExactName(names: readonly (string | null | undefined)[], query: string): boolean {
  const q = parseQuery(query);
  return names.some((name) => nameMatchScore(name, q) === 1000);
}

/**
 * Where the genre/keyword section ("Horror movies & TV") goes: first when
 * the query *is* that genre ("horror") or that keyword with nothing else
 * named exactly that ("natural disaster"), since that's what was asked for;
 * last otherwise ("dune" also names a keyword, but the film comes first).
 */
export function themePlacement(input: {
  query: string;
  label: string;
  isGenre: boolean;
  exactMatchElsewhere: boolean;
}): "first" | "last" {
  const q = parseQuery(input.query);
  const label = normalizeName(input.label);
  const named = label === q.text || label === q.full;
  if (named && (input.isGenre || !input.exactMatchElsewhere)) return "first";
  return "last";
}
