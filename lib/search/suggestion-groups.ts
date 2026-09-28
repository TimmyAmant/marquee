// The type-ahead's groups, in the search page's order — pure, so the web's
// search bar (a client component) and the server share them.

export type SuggestionKind = "movie" | "tv" | "person" | "company" | "network";
export type SuggestionGroup = "movie" | "tv" | "person" | "company";

/** How many of each group the type-ahead shows. */
export const SUGGESTION_LIMITS: Record<SuggestionGroup, number> = { movie: 4, tv: 3, person: 3, company: 2 };

/** Studios and networks share one group; anything unknown (a newer server) gets none. */
export function suggestionGroup(kind: string): SuggestionGroup | null {
  if (kind === "network" || kind === "company") return "company";
  if (kind === "movie" || kind === "tv" || kind === "person") return kind;
  return null;
}

/** Consecutive runs of one group, in the order given — for labelled
 * sections — each item keeping its index in the flat list (so ↑↓ walks
 * straight across groups). */
export function groupRuns<T extends { mediaType: string }>(
  items: readonly T[],
): { group: SuggestionGroup; items: { item: T; index: number }[] }[] {
  const runs: { group: SuggestionGroup; items: { item: T; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const group = suggestionGroup(item.mediaType);
    if (!group) return;
    const last = runs[runs.length - 1];
    if (last && last.group === group) last.items.push({ item, index });
    else runs.push({ group, items: [{ item, index }] });
  });
  return runs;
}
