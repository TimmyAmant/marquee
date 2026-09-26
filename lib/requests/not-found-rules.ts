// "Can't find": an approved request whose title is released, monitored in
// Sonarr/Radarr, has nothing on disk and nothing downloading a while after
// approval — usually no indexer has a release of it. These are the rules,
// pure and unit tested; lib/requests/not-found.ts runs them against the
// servers and the database.

/** Wait this long after approval before calling it "can't find": Radarr and
 * Sonarr search as soon as a title is added, and a slow indexer or a
 * download client that takes a while to start shouldn't set it off. */
export const DEFAULT_NOT_FOUND_AFTER_HOURS = 24;
export const MIN_NOT_FOUND_AFTER_HOURS = 1;
export const MAX_NOT_FOUND_AFTER_HOURS = 24 * 30;

/** Still not found this long after the first alert: one reminder, then no
 * more (the Requests page keeps listing it). */
export const NOT_FOUND_REALERT_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_NOT_FOUND_ALERTS = 2;

/** What Sonarr/Radarr says about a request's title right now.
 * `missing`: released, monitored, nothing on disk and nothing downloading
 * (for a show: some requested season has aired episodes and no file at all).
 * `found`: on disk or downloading. `unknown`: not released yet, not
 * monitored, not on that server, or the server didn't answer — no change. */
export type NotFoundObservation =
  | { kind: "missing"; seasons: number[] | null; arrPath: string | null }
  | { kind: "found" }
  | { kind: "unknown" };

export type NotFoundState = {
  since: Date | null;
  alerts: number;
  alertedAt: Date | null;
  dismissedAt: Date | null;
};

export type NotFoundDecision = {
  state: NotFoundState;
  /** Tell the reviewers (and the requester, if they want it) now. */
  alert: boolean;
  /** Was flagged, isn't any more: its alerts can be marked read. */
  cleared: boolean;
  changed: boolean;
};

/** The request's next state. `reviewedAt` is when it was approved. */
export function decideNotFound(
  state: NotFoundState,
  observation: NotFoundObservation,
  input: { now: Date; reviewedAt: Date | null; waitMs: number; reAlertMs?: number },
): NotFoundDecision {
  const same = { state, alert: false, cleared: false, changed: false };
  // Dismissed ("Mark as found"): never checked again.
  if (state.dismissedAt) return same;

  if (observation.kind === "found") {
    if (!state.since) return same;
    return { state: { ...state, since: null }, alert: false, cleared: true, changed: true };
  }
  if (observation.kind === "unknown") return same;

  const approvedAt = input.reviewedAt?.getTime();
  if (approvedAt === undefined || input.now.getTime() - approvedAt < input.waitMs) return same;

  const next: NotFoundState = { ...state, since: state.since ?? input.now };
  const reAlertMs = input.reAlertMs ?? NOT_FOUND_REALERT_MS;
  const alert =
    state.alerts === 0 ||
    (state.alerts < MAX_NOT_FOUND_ALERTS &&
      state.alertedAt !== null &&
      input.now.getTime() - state.alertedAt.getTime() >= reAlertMs);
  if (alert) {
    next.alerts = state.alerts + 1;
    next.alertedAt = input.now;
  }
  return { state: next, alert, cleared: false, changed: alert || !state.since };
}

/** The part of a Radarr movie the check reads. */
export type RadarrMovieFacts = {
  id: number;
  tmdbId: number;
  titleSlug?: string;
  status: string;
  isAvailable?: boolean;
  monitored: boolean;
  hasFile: boolean;
};

export function observeMovie(movie: RadarrMovieFacts | null, queued: boolean): NotFoundObservation {
  if (!movie) return { kind: "unknown" };
  if (movie.hasFile || queued) return { kind: "found" };
  if (!movie.monitored) return { kind: "unknown" };
  // "tba" / "announced" / "inCinemas": coming soon, not missing. Radarr's own
  // isAvailable (its minimum availability) gets the last word when it's there.
  if (movie.status !== "released" || movie.isAvailable === false) return { kind: "unknown" };
  return { kind: "missing", seasons: null, arrPath: `/movie/${movie.titleSlug || movie.tmdbId}` };
}

/** The part of a Sonarr series the check reads. */
export type SonarrSeriesFacts = {
  id: number;
  titleSlug?: string;
  status: string;
  monitored: boolean;
  seasons?: {
    seasonNumber: number;
    monitored: boolean;
    statistics?: { episodeFileCount: number; episodeCount: number };
  }[];
};

/** `requested`: the seasons asked for, or null for the whole series (every
 * monitored season but specials). A season counts as not found when it has
 * aired episodes Sonarr wants (`episodeCount`) and not one file. */
export function observeSeries(
  series: SonarrSeriesFacts | null,
  queued: boolean,
  requested: readonly number[] | null,
): NotFoundObservation {
  if (!series) return { kind: "unknown" };
  if (queued) return { kind: "found" };
  if (!series.monitored || series.status === "upcoming") return { kind: "unknown" };
  const seasons = (series.seasons ?? []).filter((s) =>
    requested ? requested.includes(s.seasonNumber) : s.seasonNumber > 0 && s.monitored,
  );
  const aired = seasons.filter((s) => (s.statistics?.episodeCount ?? 0) > 0);
  // Nothing aired yet (a new season, a show that hasn't started): coming soon.
  if (aired.length === 0) return { kind: "unknown" };
  const missing = aired.filter((s) => (s.statistics?.episodeFileCount ?? 0) === 0).map((s) => s.seasonNumber);
  if (missing.length === 0) return { kind: "found" };
  const arrPath = series.titleSlug ? `/series/${series.titleSlug}` : null;
  // A whole-series request none of which turned up reads as the show itself.
  const whole = !requested && missing.length === aired.length;
  return { kind: "missing", seasons: whole ? null : missing, arrPath };
}

/** The hours setting, clamped; anything unusable means the default. */
export function notFoundAfterHours(saved: number | null | undefined): number {
  if (typeof saved !== "number" || !Number.isFinite(saved)) return DEFAULT_NOT_FOUND_AFTER_HOURS;
  return Math.min(MAX_NOT_FOUND_AFTER_HOURS, Math.max(MIN_NOT_FOUND_AFTER_HOURS, Math.round(saved)));
}

/** Checks a PUT body's `afterHours`. Pure; unit tested. */
export function parseNotFoundAfterHours(value: unknown): { ok: true; hours: number } | { ok: false; error: string } {
  if (typeof value !== "number" || !Number.isInteger(value)) return { ok: false, error: '"afterHours" must be a whole number of hours.' };
  if (value < MIN_NOT_FOUND_AFTER_HOURS || value > MAX_NOT_FOUND_AFTER_HOURS) {
    return { ok: false, error: `"afterHours" must be between ${MIN_NOT_FOUND_AFTER_HOURS} and ${MAX_NOT_FOUND_AFTER_HOURS}.` };
  }
  return { ok: true, hours: value };
}

/** "Ice Age (2002)", "Dune (Season 2)". */
export function notFoundName(title: string, year: number | null, seasons: readonly number[] | null, seasonsText: string | null): string {
  if (seasons && seasons.length > 0 && seasonsText) return `${title} (${seasonsText})`;
  return year ? `${title} (${year})` : title;
}

/** "Can't find for 3 days": how long it's been listed, in the largest whole unit. */
export function notFoundAgeLabel(since: Date, now: Date): string {
  const hours = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 3_600_000));
  if (hours < 1) return "under an hour";
  if (hours < 48) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.floor(hours / 24);
  return `${days} days`;
}

/** The tip under a "Can't find" row's actions. */
export function notFoundHint(mediaType: "movie" | "tv"): string {
  return mediaType === "movie"
    ? "In Radarr, Interactive Search on the movie lists every release the indexers have, so you can pick one by hand."
    : "In Sonarr, Interactive Search on a season or episode lists every release the indexers have, so you can pick one by hand.";
}

/** An address the browser can open for the title in Sonarr/Radarr. */
export function arrTitleUrl(baseUrl: string | null | undefined, arrPath: string | null | undefined): string | null {
  if (!baseUrl || !arrPath) return null;
  return `${baseUrl.replace(/\/+$/, "")}${arrPath}`;
}
