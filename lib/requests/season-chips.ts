/** The little "S1" "S2" chips on a request card — one per season asked
 * for; nothing for a whole-series (or movie) request. Runs of more than
 * eight are shortened to "S1–S12" so a long-running show doesn't fill the
 * card. */
export function seasonChips(seasons: number[] | null | undefined): string[] {
  if (!seasons || seasons.length === 0) return [];
  const sorted = [...new Set(seasons)].sort((a, b) => a - b);
  if (sorted.length > 8) return [`S${sorted[0]}–S${sorted[sorted.length - 1]}`];
  return sorted.map((n) => `S${n}`);
}
