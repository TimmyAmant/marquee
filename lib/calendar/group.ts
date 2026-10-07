// One row per title on a calendar day (app/calendar, the apps' grids):
// four episodes of a show dropping at once read as one "S01E03–E06" row
// instead of four identical ones.

export type GroupableEntry = {
  mediaType: string;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  subtitle: string;
};

export type DayTitle<T extends GroupableEntry> = {
  first: T;
  entries: T[];
  /** "S01E03", "S01E03–E06", "S01E10 · S02E01", or a movie's release
   * types joined ("In theaters · Digital release"). */
  subtitle: string;
};

function episodeCode(code: string): { season: number; episode: number } | null {
  const match = /^S(\d+)E(\d+)$/i.exec(code.trim());
  return match ? { season: Number(match[1]), episode: Number(match[2]) } : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function mergedSubtitle(codes: string[]): string {
  if (codes.length <= 1) return codes[0] ?? "";
  const episodes = codes.map(episodeCode);
  if (episodes.every((e) => e !== null)) {
    const seasons = new Set(episodes.map((e) => e!.season));
    if (seasons.size === 1) {
      const numbers = episodes.map((e) => e!.episode);
      return `S${pad(episodes[0]!.season)}E${pad(Math.min(...numbers))}–E${pad(Math.max(...numbers))}`;
    }
  }
  return codes.join(" · ");
}

/** A day's entries, one per title, in the order each first appears. */
export function groupDayEntries<T extends GroupableEntry>(entries: T[]): DayTitle<T>[] {
  const byKey = new Map<string, T[]>();
  for (const entry of entries) {
    const key = `${entry.mediaType}:${entry.tmdbId}`;
    const list = byKey.get(key);
    if (list) list.push(entry);
    else byKey.set(key, [entry]);
  }
  return [...byKey.values()].map((list) => ({
    first: list[0],
    entries: list,
    subtitle: mergedSubtitle(list.map((e) => e.subtitle)),
  }));
}
