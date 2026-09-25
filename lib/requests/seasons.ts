// Pure rules for per-season TV requests: what a client may send, which of
// those seasons are still worth asking for, and how each season of a show
// looks to the member deciding what to request. Dependency-free so they can
// be unit tested; createRequest (lib/requests/mutate.ts), the title page
// loader and the API's title DTO all share them.

/** Far more than any real show has; it only bounds what one request body can
 * make the server check. */
export const MAX_REQUESTED_SEASONS = 100;

export type ParsedSeasons = { ok: true; seasons: number[] | null } | { ok: false; error: string };

/** A request's `seasons` as the client sent it: omitted or null means the
 * whole series (what every client did before per-season requests), anything
 * else must be a non-empty list of season numbers. Returned sorted and
 * without repeats, which is how it's stored. */
export function parseSeasonsInput(value: unknown): ParsedSeasons {
  if (value === undefined || value === null) return { ok: true, seasons: null };
  if (!Array.isArray(value)) return { ok: false, error: "Seasons must be a list of season numbers." };
  if (value.length === 0) return { ok: false, error: "Pick at least one season." };
  if (value.length > MAX_REQUESTED_SEASONS) return { ok: false, error: "That's too many seasons for one request." };
  for (const n of value) {
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) {
      return { ok: false, error: "Season numbers must be whole numbers." };
    }
  }
  const seasons = [...new Set(value as number[])].sort((a, b) => a - b);
  return { ok: true, seasons };
}

/** Every requested season has to be one TMDb lists for the show — season 0
 * (specials) included only when TMDb has it. Returns the error to show, or
 * null when they all check out. */
export function unlistedSeasonError(seasons: number[], listed: readonly number[]): string | null {
  const known = new Set(listed);
  const missing = seasons.find((n) => !known.has(n));
  if (missing === undefined) return null;
  return missing === 0 ? "This show has no specials listed." : `Season ${missing} isn't listed for this show.`;
}

/** One season as the library owner's Sonarr has it. `monitored` is whether
 * Sonarr will actually fetch it — the season's own flag and the series'. */
export type SeasonLibraryState = { seasonNumber: number; monitored: boolean; complete: boolean };

/**
 * Whether Sonarr has every episode of a season. Sonarr's `episodeCount` only
 * counts monitored episodes (plus ones that already have a file), so for an
 * unmonitored season it's just the files on disk and would always look
 * complete — there the season's full `totalEpisodeCount` is the bar instead.
 */
export function isSeasonComplete(input: {
  monitored: boolean;
  episodeFileCount: number;
  episodeCount: number;
  totalEpisodeCount?: number;
}): boolean {
  const total = input.monitored ? input.episodeCount : (input.totalEpisodeCount ?? input.episodeCount);
  return total > 0 && input.episodeFileCount >= total;
}

/** The requested seasons that aren't already monitored or complete in Sonarr
 * — the only ones a new request stores. `library` is null when Sonarr isn't
 * connected or isn't tracking the show, and then nothing is filtered out. */
export function seasonsStillNeeded(requested: readonly number[], library: SeasonLibraryState[] | null): number[] {
  if (!library) return [...requested];
  const covered = new Set(library.filter((s) => s.monitored || s.complete).map((s) => s.seasonNumber));
  return requested.filter((n) => !covered.has(n));
}

/** A viewer's own requests for one title that can still matter: the pending
 * one (at most one, per requests_pending_unique_idx) and approved ones. */
export type ViewerTitleRequest = { status: "pending" | "approved"; seasons: number[] | null };

export type ViewerSeasonRequests = {
  hasPending: boolean;
  /** The pending request's seasons; null when there's none or it's for the whole series. */
  pendingSeasons: number[] | null;
  /** Seasons this viewer has asked for, pending or approved. */
  requested: Set<number>;
};

/** A pending whole-series request asks for every season, so all of them
 * count as requested. An approved request only counts while Sonarr isn't
 * tracking the show: once it is, Sonarr's own monitoring is the better
 * answer to whether a season is on its way — and a season whose approved
 * request was later undone there (unmonitored, or the show deleted) can be
 * asked for again. */
export function summarizeViewerRequests(
  rows: readonly ViewerTitleRequest[],
  allSeasons: readonly number[],
  sonarrTracking = false,
): ViewerSeasonRequests {
  const pending = rows.find((r) => r.status === "pending") ?? null;
  const requested = new Set<number>();
  for (const row of rows) {
    if (row.status === "approved" && sonarrTracking) continue;
    if (row.seasons) row.seasons.forEach((n) => requested.add(n));
    else if (row.status === "pending") allSeasons.forEach((n) => requested.add(n));
  }
  return { hasPending: pending !== null, pendingSeasons: pending?.seasons ?? null, requested };
}

export type SeasonRequestState = {
  /** Null when Sonarr isn't connected or isn't tracking the show. */
  monitored: boolean | null;
  complete: boolean;
  requested: boolean;
  requestable: boolean;
};

/** How each season looks to the viewer: a member can request any season
 * that isn't complete, monitored, or already asked for by them. */
export function seasonRequestStates(input: {
  seasonNumbers: readonly number[];
  library: SeasonLibraryState[] | null;
  requested: ReadonlySet<number>;
  isMember: boolean;
  /** In Plex or Jellyfin but not in Sonarr: owned, with no per-season
   * detail, so every season counts as complete rather than requestable. */
  ownedOutsideSonarr?: boolean;
}): Map<number, SeasonRequestState> {
  const byNumber = new Map((input.library ?? []).map((s) => [s.seasonNumber, s]));
  const states = new Map<number, SeasonRequestState>();
  for (const n of input.seasonNumbers) {
    const sonarr = byNumber.get(n);
    // A tracked show with a season Sonarr doesn't list yet: not monitored.
    const monitored = input.library ? (sonarr?.monitored ?? false) : null;
    const complete = sonarr?.complete ?? Boolean(input.ownedOutsideSonarr && !input.library);
    const requested = input.requested.has(n);
    states.set(n, {
      monitored,
      complete,
      requested,
      requestable: input.isMember && !complete && !monitored && !requested,
    });
  }
  return states;
}

/** What the season picker shows for a row: a checkbox, or why there isn't
 * one. Complete wins over monitored (a finished season stays monitored for
 * upgrades), and both over the viewer's own request. */
export type SeasonPickerState = "requestable" | "complete" | "monitored" | "requested" | "unavailable";

export function seasonPickerState(state: SeasonRequestState | undefined): SeasonPickerState {
  if (!state) return "unavailable";
  if (state.complete) return "complete";
  if (state.monitored) return "monitored";
  if (state.requested) return "requested";
  return state.requestable ? "requestable" : "unavailable";
}

/** `viewer.canRequestSeasons`: a member with nothing pending for the show and
 * at least one season left to ask for. */
export function canRequestSeasons(input: {
  isMember: boolean;
  isTv: boolean;
  hasPending: boolean;
  states: Map<number, SeasonRequestState>;
}): boolean {
  if (!input.isMember || !input.isTv || input.hasPending) return false;
  for (const state of input.states.values()) if (state.requestable) return true;
  return false;
}
