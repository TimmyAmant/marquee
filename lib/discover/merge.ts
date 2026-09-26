// Pure helpers for mixed movie + series rows (lib/discover/custom-shelves.ts).

/** Several lists of titles as one, most popular first; equal popularity
 * keeps the lists' own order, earlier lists first. Repeats (same media type
 * and id) are dropped. */
export function interleaveByPopularity<T extends { mediaType: string; tmdbId: number; popularity: number }>(
  lists: T[][],
): T[] {
  const tagged = lists.flatMap((list, listIndex) => list.map((item, index) => ({ item, listIndex, index })));
  tagged.sort(
    (a, b) => b.item.popularity - a.item.popularity || a.index - b.index || a.listIndex - b.listIndex,
  );
  const seen = new Set<string>();
  const out: T[] = [];
  for (const { item } of tagged) {
    const key = `${item.mediaType}:${item.tmdbId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
