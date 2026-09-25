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
 * everything Sonarr was actually fetching stays that way — a request only
 * ever adds. `seriesMonitored` matters because "Stop monitoring" turns off
 * the series and leaves every season's own flag on: those seasons weren't
 * being fetched, and turning the series back on for one requested season
 * mustn't start downloading all the rest. */
export function seasonsForUpdate<T extends SonarrSeasonLike>(
  seasons: readonly T[],
  requested: readonly number[],
  seriesMonitored = true,
): (T & { monitored: boolean })[] {
  const wanted = new Set(requested);
  return seasons.map((s) => ({
    ...s,
    monitored: (seriesMonitored && Boolean(s.monitored)) || wanted.has(s.seasonNumber),
  }));
}

/** Every season a whole-series request covers: all of them but specials
 * (season 0), which Sonarr leaves off when it adds a whole series too, plus
 * specials if they were already on. For approving a whole-series request on
 * a show a season request had already added with only some seasons. */
export function seasonsForWholeSeries<T extends SonarrSeasonLike>(
  seasons: readonly T[],
  seriesMonitored = true,
): (T & { monitored: boolean })[] {
  return seasons.map((s) => ({
    ...s,
    monitored: s.seasonNumber > 0 || (seriesMonitored && Boolean(s.monitored)),
  }));
}

/** The requested seasons Sonarr actually lists for the show. TMDb and TVDB
 * don't always number seasons the same way, and a season can't be monitored
 * or searched for if Sonarr doesn't know it. */
export function seasonsSonarrKnows(seasons: readonly SonarrSeasonLike[], requested: readonly number[]): number[] {
  const known = new Set(seasons.map((s) => s.seasonNumber));
  return requested.filter((n) => known.has(n));
}
