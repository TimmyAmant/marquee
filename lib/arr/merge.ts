import type { LibraryStatus } from "@/components/status-badge";
import { statusRank } from "@/lib/arr/fan-out";

// Folding several Sonarr (or Radarr) servers' copies of the same titles into
// one library row each. Pure, so it's shared with tests.

export type ServerCopy<F extends { status: LibraryStatus }> = {
  serverId: string;
  tmdbId: number;
  fields: F;
};

/**
 * One copy per title: the furthest-along one (owned beats downloading beats
 * wanted beats coming soon), and between equals the one on the server that
 * comes first in `serverOrder` — the default server is listed first, so it
 * wins a tie. Titles come out in the order they were first seen.
 */
export function mergeServerCopies<F extends { status: LibraryStatus }>(
  copies: readonly ServerCopy<F>[],
  serverOrder: readonly string[],
): ServerCopy<F>[] {
  const position = (serverId: string) => {
    const index = serverOrder.indexOf(serverId);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const best = new Map<number, ServerCopy<F>>();
  for (const copy of copies) {
    const current = best.get(copy.tmdbId);
    if (!current) {
      best.set(copy.tmdbId, copy);
      continue;
    }
    const rank = statusRank(copy.fields.status);
    const currentRank = statusRank(current.fields.status);
    if (rank > currentRank || (rank === currentRank && position(copy.serverId) < position(current.serverId))) {
      best.set(copy.tmdbId, copy);
    }
  }
  return [...best.values()];
}

type SeasonState = { seasonNumber: number; have: number; total: number; monitored: boolean; complete: boolean };

/**
 * A show's seasons across several Sonarr servers: each season as the server
 * that's furthest along with it has it — complete beats monitored beats
 * neither, then more episodes on disk. A season any server lists is in.
 * Sorted by season number.
 */
export function mergeSeasonStates<S extends SeasonState>(perServer: readonly (readonly S[])[]): S[] {
  const score = (s: S) => (s.complete ? 2 : 0) + (s.monitored ? 1 : 0);
  const best = new Map<number, S>();
  for (const seasons of perServer) {
    for (const season of seasons) {
      const current = best.get(season.seasonNumber);
      if (
        !current ||
        score(season) > score(current) ||
        (score(season) === score(current) && season.have > current.have)
      ) {
        best.set(season.seasonNumber, season);
      }
    }
  }
  return [...best.values()].sort((a, b) => a.seasonNumber - b.seasonNumber);
}
