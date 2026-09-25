// Builds the `seasons` list Sonarr takes when a request names specific
// seasons. Pure (no fetch) so the monitoring rules are unit tested apart
// from the HTTP calls in lib/sonarr/client.ts. Each season object is copied
// through with only `monitored` changed, since Sonarr's add and update
// bodies echo back whatever else it reported for the season.

type SonarrSeasonLike = { seasonNumber: number; monitored?: boolean };

/** Adding a series for a season request: only the requested seasons are
 * monitored, so Sonarr's search-on-add fetches just those. */
export function seasonsForAdd<T extends SonarrSeasonLike>(
  seasons: readonly T[],
  requested: readonly number[],
): (T & { monitored: boolean })[] {
  const wanted = new Set(requested);
  return seasons.map((s) => ({ ...s, monitored: wanted.has(s.seasonNumber) }));
}

/** A series Sonarr already has: the requested seasons are switched on and
 * everything already monitored stays that way — a request only ever adds. */
export function seasonsForUpdate<T extends SonarrSeasonLike>(
  seasons: readonly T[],
  requested: readonly number[],
): (T & { monitored: boolean })[] {
  const wanted = new Set(requested);
  return seasons.map((s) => ({ ...s, monitored: Boolean(s.monitored) || wanted.has(s.seasonNumber) }));
}

/** The requested seasons Sonarr actually lists for the show. TMDb and TVDB
 * don't always number seasons the same way, and a season can't be monitored
 * or searched for if Sonarr doesn't know it. */
export function seasonsSonarrKnows(seasons: readonly SonarrSeasonLike[], requested: readonly number[]): number[] {
  const known = new Set(seasons.map((s) => s.seasonNumber));
  return requested.filter((n) => known.has(n));
}
