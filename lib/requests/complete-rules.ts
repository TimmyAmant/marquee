// When a request counts as complete — everything asked for is in the
// library — and what a check does with that (lib/requests/complete.ts).
// Pure; unit tested.

/** One episode as Sonarr has it. */
export type EpisodeFacts = {
  seasonNumber: number;
  hasFile: boolean;
  monitored: boolean;
  /** When it aired (UTC); missing when there's no date yet. */
  airDateUtc?: string | null;
};

/** What the library has of a title, from every place that was asked. */
export type TitleObservation =
  /** Nothing could be asked (no server of the kind, or none answered). */
  | { kind: "unknown" }
  /** A movie: whether a copy (of the right 4K-ness) has its file. */
  | { kind: "movie"; hasFile: boolean }
  /** A show: each server's episode list that has the series (none when
   * the servers answered and none has it). */
  | { kind: "tv"; copies: EpisodeFacts[][] };

export type CompletionVerdict = "complete" | "incomplete" | "unknown";

/** The seasons a request covers: the ones it names (specials only if it
 * names season 0), or for a whole-show request every season but specials. */
export function coversSeason(seasons: readonly number[] | null, seasonNumber: number): boolean {
  return seasons ? seasons.includes(seasonNumber) : seasonNumber > 0;
}

/**
 * Whether one server's copy has every aired episode of the seasons the
 * request covers. An episode that hasn't aired (no date, or a date still
 * ahead) doesn't count against it. Neither does an aired one Sonarr has been
 * told not to fetch (unmonitored, no file): nothing is coming for it, so
 * waiting on it would mean never saying anything — the same episodes
 * Sonarr's own "x of y" counts leave out. It takes at least one aired
 * episode: a request for a season that hasn't started isn't ready.
 */
export function episodesComplete(episodes: readonly EpisodeFacts[], seasons: readonly number[] | null, now: Date): boolean {
  const due = episodes.filter(
    (e) => coversSeason(seasons, e.seasonNumber) && hasAired(e, now) && (e.monitored || e.hasFile),
  );
  return due.length > 0 && due.every((e) => e.hasFile);
}

function hasAired(episode: EpisodeFacts, now: Date): boolean {
  if (!episode.airDateUtc) return false;
  const at = Date.parse(episode.airDateUtc);
  return Number.isFinite(at) && at <= now.getTime();
}

/** The request's verdict from what the library has of its title: a show is
 * complete when any one server has all of it. */
export function completionVerdict(
  observation: TitleObservation,
  seasons: readonly number[] | null,
  now: Date,
): CompletionVerdict {
  if (observation.kind === "unknown") return "unknown";
  if (observation.kind === "movie") return observation.hasFile ? "complete" : "incomplete";
  return observation.copies.some((episodes) => episodesComplete(episodes, seasons, now)) ? "complete" : "incomplete";
}

/** What a check does with a request that hasn't been announced:
 * - `announce`: tell the requester (it's armed and now complete);
 * - `mark`: record it as told without telling anyone — a request from
 *   before these notices whose first check already finds it complete;
 * - `arm`: that older request was seen incomplete, so its completion
 *   will be announced after all;
 * - `none`: nothing to do yet. */
export type CompletionAction = "announce" | "mark" | "arm" | "none";

export function completionAction(verdict: CompletionVerdict, armed: boolean): CompletionAction {
  if (verdict === "complete") return armed ? "announce" : "mark";
  if (verdict === "incomplete" && !armed) return "arm";
  return "none";
}
