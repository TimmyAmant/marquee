// A series poster's "have/total" episode count (e.g. "96/96", "120/125").
// Pure, so it's shared with tests; the synced numbers it works from are
// stored by lib/arr/sync.ts (Sonarr), lib/plex/sync.ts and
// lib/jellyfin/sync.ts, and read by getEpisodeCountMap (lib/library/query.ts).
//
// Both numbers leave out specials (season 0). `total` is the episodes that
// have aired; `have` the ones with a file on disk.

export type EpisodeCounts = { have: number; total: number };

/** One Sonarr season, as /api/v3/series lists it. */
export type SonarrSeasonForCount = {
  seasonNumber: number;
  monitored?: boolean;
  statistics?: {
    episodeFileCount?: number;
    /** Sonarr: monitored episodes that have aired, plus any with a file. */
    episodeCount?: number;
    /** Every episode of the season, monitored or not, aired or not. */
    totalEpisodeCount?: number;
    /** The next monitored episode's air date, when there is one. */
    nextAiring?: string | null;
  };
};

/**
 * Sonarr's aired and on-disk episode counts for a series, specials left out.
 *
 * Sonarr's own `episodeCount` is "monitored and aired, or has a file" — for
 * a monitored season that's exactly the aired episodes. An unmonitored
 * season it would count as complete however little is on disk, so there the
 * season's `totalEpisodeCount` stands in, as long as the season has nothing
 * still to air. A series-level monitored flag of false makes every season
 * count as unmonitored, the same way Sonarr treats it.
 *
 * Null when Sonarr lists no regular season at all (nothing to count yet).
 */
export function sonarrEpisodeCounts(
  seasons: readonly SonarrSeasonForCount[] | undefined,
  seriesMonitored = true,
): EpisodeCounts | null {
  const regular = (seasons ?? []).filter((s) => s.seasonNumber > 0);
  if (regular.length === 0) return null;
  let have = 0;
  let total = 0;
  for (const season of regular) {
    const stats = season.statistics ?? {};
    const files = stats.episodeFileCount ?? 0;
    const wanted = stats.episodeCount ?? 0;
    const monitored = seriesMonitored && season.monitored !== false;
    const fullyAired = !stats.nextAiring;
    const aired = !monitored && fullyAired ? Math.max(wanted, stats.totalEpisodeCount ?? 0) : wanted;
    have += files;
    total += aired;
  }
  return { have, total };
}

/** The bits of a TMDb TV record the aired count reads. */
export type TmdbAiringInfo = {
  seasons?: { season_number: number; episode_count: number }[] | null;
  last_episode_to_air?: { season_number: number; episode_number: number; air_date?: string | null } | null;
};

/**
 * Aired episodes per TMDb (specials left out) — the total when Sonarr isn't
 * there to say: every regular season before the latest aired episode's in
 * full, plus that season up to the latest aired episode. Null when TMDb has
 * no aired episode on record.
 */
export function tmdbAiredEpisodeCount(raw: TmdbAiringInfo | null | undefined): number | null {
  const last = raw?.last_episode_to_air;
  if (!last || !(last.season_number > 0) || !(last.episode_number > 0)) return null;
  const earlier = (raw?.seasons ?? [])
    .filter((s) => s.season_number > 0 && s.season_number < last.season_number)
    .reduce((sum, s) => sum + (s.episode_count ?? 0), 0);
  return earlier + last.episode_number;
}

/** Episodes a media server has files for, specials (season 0) left out —
 * `seasonNumber` null (unknown) counts as a regular episode. */
export function regularEpisodeCount(episodes: readonly { seasonNumber: number | null | undefined }[]): number {
  return episodes.filter((e) => e.seasonNumber !== 0).length;
}

/**
 * The count a poster shows: Sonarr's where it tracks the show, else the
 * media server's files against TMDb's aired episodes. Null — no count on the
 * poster — when neither source has both numbers, or nothing has aired.
 * Never more than complete: `have` is capped at `total` (a file for an
 * episode that hasn't aired yet, or TMDb and TheTVDB numbering a show
 * differently, would otherwise read "63/62").
 */
export function pickEpisodeCounts(input: {
  sonarr: { have: number | null; total: number | null } | null;
  mediaServerHave: number | null;
  tmdbAired: number | null;
}): EpisodeCounts | null {
  const s = input.sonarr;
  if (s && s.have != null && s.total != null && s.total > 0) return capped(s.have, s.total);
  if (input.mediaServerHave != null && input.tmdbAired != null && input.tmdbAired > 0) {
    return capped(input.mediaServerHave, input.tmdbAired);
  }
  return null;
}

function capped(have: number, total: number): EpisodeCounts {
  return { have: Math.min(have, total), total };
}

/** Every aired episode is on disk. */
export function isEpisodeCountComplete(counts: EpisodeCounts): boolean {
  return counts.have >= counts.total;
}
