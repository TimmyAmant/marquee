import { describe, it, expect } from "vitest";
import {
  MAX_REQUESTED_SEASONS,
  canRequestSeasons,
  isSeasonComplete,
  parseSeasonsInput,
  seasonPickerState,
  seasonRequestStates,
  seasonsStillNeeded,
  summarizeViewerRequests,
  unlistedSeasonError,
  type SeasonLibraryState,
} from "./seasons";

describe("parseSeasonsInput", () => {
  it("treats omitted or null as the whole series", () => {
    expect(parseSeasonsInput(undefined)).toEqual({ ok: true, seasons: null });
    expect(parseSeasonsInput(null)).toEqual({ ok: true, seasons: null });
  });

  it("sorts and de-duplicates", () => {
    expect(parseSeasonsInput([3, 1, 2, 3, 1])).toEqual({ ok: true, seasons: [1, 2, 3] });
    expect(parseSeasonsInput([0])).toEqual({ ok: true, seasons: [0] });
  });

  it("rejects anything that isn't a non-empty list of whole, non-negative numbers", () => {
    for (const bad of ["1", 1, {}, true, [], [1.5], [-1], ["1"], [null], [Number.NaN], [Number.MAX_SAFE_INTEGER + 1]]) {
      expect(parseSeasonsInput(bad).ok).toBe(false);
    }
  });

  it("caps how many seasons one request can name", () => {
    const many = Array.from({ length: MAX_REQUESTED_SEASONS + 1 }, (_, i) => i);
    expect(parseSeasonsInput(many).ok).toBe(false);
    expect(parseSeasonsInput(many.slice(0, MAX_REQUESTED_SEASONS)).ok).toBe(true);
    // The cap is on what was sent, before repeats collapse.
    expect(parseSeasonsInput(Array(MAX_REQUESTED_SEASONS + 1).fill(1)).ok).toBe(false);
  });
});

describe("unlistedSeasonError", () => {
  it("passes seasons TMDb lists", () => {
    expect(unlistedSeasonError([1, 2], [0, 1, 2, 3])).toBeNull();
  });

  it("names the first season TMDb doesn't list", () => {
    expect(unlistedSeasonError([1, 7], [1, 2])).toBe("Season 7 isn't listed for this show.");
  });

  it("only allows specials when TMDb lists them", () => {
    expect(unlistedSeasonError([0], [1, 2])).toBe("This show has no specials listed.");
    expect(unlistedSeasonError([0], [0, 1])).toBeNull();
  });
});

describe("isSeasonComplete", () => {
  it("is complete when every counted episode has a file", () => {
    expect(isSeasonComplete({ monitored: true, episodeFileCount: 10, episodeCount: 10 })).toBe(true);
    expect(isSeasonComplete({ monitored: true, episodeFileCount: 9, episodeCount: 10 })).toBe(false);
  });

  it("never calls an empty season complete", () => {
    expect(isSeasonComplete({ monitored: true, episodeFileCount: 0, episodeCount: 0 })).toBe(false);
  });

  it("measures an unmonitored season against all of its episodes", () => {
    // Sonarr's episodeCount only counts files for an unmonitored season.
    expect(
      isSeasonComplete({ monitored: false, episodeFileCount: 3, episodeCount: 3, totalEpisodeCount: 10 }),
    ).toBe(false);
    expect(
      isSeasonComplete({ monitored: false, episodeFileCount: 10, episodeCount: 10, totalEpisodeCount: 10 }),
    ).toBe(true);
  });
});

const library: SeasonLibraryState[] = [
  { seasonNumber: 0, monitored: false, complete: false },
  { seasonNumber: 1, monitored: true, complete: true },
  { seasonNumber: 2, monitored: true, complete: false },
  { seasonNumber: 3, monitored: false, complete: true },
  { seasonNumber: 4, monitored: false, complete: false },
];

describe("seasonsStillNeeded", () => {
  it("drops seasons already monitored or complete", () => {
    expect(seasonsStillNeeded([0, 1, 2, 3, 4], library)).toEqual([0, 4]);
    expect(seasonsStillNeeded([1, 2], library)).toEqual([]);
  });

  it("keeps a season Sonarr doesn't list yet", () => {
    expect(seasonsStillNeeded([5], library)).toEqual([5]);
  });

  it("keeps everything when Sonarr doesn't track the show", () => {
    expect(seasonsStillNeeded([1, 2], null)).toEqual([1, 2]);
  });
});

describe("summarizeViewerRequests", () => {
  it("reports the pending request's seasons and everything asked for", () => {
    const summary = summarizeViewerRequests(
      [
        { status: "pending", seasons: [3] },
        { status: "approved", seasons: [1, 2] },
      ],
      [1, 2, 3, 4],
    );
    expect(summary.hasPending).toBe(true);
    expect(summary.pendingSeasons).toEqual([3]);
    expect([...summary.requested].sort()).toEqual([1, 2, 3]);
  });

  it("counts a pending whole-series request as every season, an approved one as none", () => {
    expect([...summarizeViewerRequests([{ status: "pending", seasons: null }], [1, 2]).requested]).toEqual([1, 2]);
    const approved = summarizeViewerRequests([{ status: "approved", seasons: null }], [1, 2]);
    expect(approved).toMatchObject({ hasPending: false, pendingSeasons: null });
    expect(approved.requested.size).toBe(0);
  });
});

describe("seasonRequestStates", () => {
  it("marks each season for a member", () => {
    const states = seasonRequestStates({
      seasonNumbers: [0, 1, 2, 4, 5],
      library,
      requested: new Set([4]),
      isMember: true,
    });
    expect(states.get(0)).toEqual({ monitored: false, complete: false, requested: false, requestable: true });
    expect(states.get(1)).toMatchObject({ monitored: true, complete: true, requestable: false });
    expect(states.get(2)).toMatchObject({ monitored: true, requestable: false });
    expect(states.get(4)).toMatchObject({ requested: true, requestable: false });
    // Tracked show, season Sonarr doesn't know yet: not monitored, requestable.
    expect(states.get(5)).toEqual({ monitored: false, complete: false, requested: false, requestable: true });
  });

  it("reports monitored as unknown without Sonarr, and nothing requestable for the admin", () => {
    const states = seasonRequestStates({ seasonNumbers: [1], library: null, requested: new Set(), isMember: false });
    expect(states.get(1)).toEqual({ monitored: null, complete: false, requested: false, requestable: false });
  });
});

describe("canRequestSeasons", () => {
  const states = seasonRequestStates({ seasonNumbers: [1, 4], library, requested: new Set(), isMember: true });

  it("is true for a member with a requestable season and nothing pending", () => {
    expect(canRequestSeasons({ isMember: true, isTv: true, hasPending: false, states })).toBe(true);
  });

  it("is false with a pending request, for the admin, for movies, or with nothing left", () => {
    expect(canRequestSeasons({ isMember: true, isTv: true, hasPending: true, states })).toBe(false);
    expect(canRequestSeasons({ isMember: false, isTv: true, hasPending: false, states })).toBe(false);
    expect(canRequestSeasons({ isMember: true, isTv: false, hasPending: false, states })).toBe(false);
    const covered = seasonRequestStates({ seasonNumbers: [1, 2], library, requested: new Set(), isMember: true });
    expect(canRequestSeasons({ isMember: true, isTv: true, hasPending: false, states: covered })).toBe(false);
  });
});

describe("seasonPickerState", () => {
  it("prefers complete, then monitored, then requested", () => {
    expect(seasonPickerState({ monitored: true, complete: true, requested: true, requestable: false })).toBe("complete");
    expect(seasonPickerState({ monitored: true, complete: false, requested: true, requestable: false })).toBe("monitored");
    expect(seasonPickerState({ monitored: false, complete: false, requested: true, requestable: false })).toBe("requested");
    expect(seasonPickerState({ monitored: null, complete: false, requested: false, requestable: true })).toBe("requestable");
    expect(seasonPickerState({ monitored: null, complete: false, requested: false, requestable: false })).toBe("unavailable");
    expect(seasonPickerState(undefined)).toBe("unavailable");
  });
});

describe("approved requests once Sonarr tracks the show", () => {
  it("count as requested only while Sonarr has no record of it", () => {
    const rows = [{ status: "approved" as const, seasons: [1] }];
    expect(summarizeViewerRequests(rows, [1, 2]).requested.has(1)).toBe(true);
    // Tracked: Sonarr's monitoring decides, so a season unmonitored there
    // after approval can be asked for again.
    expect(summarizeViewerRequests(rows, [1, 2], true).requested.has(1)).toBe(false);
    // A pending request always counts.
    expect(summarizeViewerRequests([{ status: "pending", seasons: [2] }], [1, 2], true).requested.has(2)).toBe(true);
  });
});

describe("a show owned in Plex or Jellyfin but not in Sonarr", () => {
  it("offers no season to request", () => {
    const states = seasonRequestStates({
      seasonNumbers: [1, 2],
      library: null,
      requested: new Set(),
      isMember: true,
      ownedOutsideSonarr: true,
    });
    expect([...states.values()].map((s) => s.requestable)).toEqual([false, false]);
    expect(seasonPickerState(states.get(1))).toBe("complete");
    expect(canRequestSeasons({ isMember: true, isTv: true, hasPending: false, states })).toBe(false);
  });
});
