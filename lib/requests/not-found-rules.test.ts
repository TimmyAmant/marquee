import { describe, expect, it } from "vitest";
import {
  arrTitleUrl,
  decideNotFound,
  notFoundAfterHours,
  notFoundAgeLabel,
  notFoundName,
  observeMovie,
  observeSeries,
  parseNotFoundAfterHours,
  type NotFoundState,
} from "./not-found-rules";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const approved = new Date("2026-09-01T12:00:00Z");
const fresh: NotFoundState = { since: null, alerts: 0, alertedAt: null, dismissedAt: null };
const missing = { kind: "missing" as const, seasons: null, arrPath: "/movie/425" };
const at = (ms: number) => new Date(approved.getTime() + ms);
const decide = (state: NotFoundState, obs: Parameters<typeof decideNotFound>[1], now: Date) =>
  decideNotFound(state, obs, { now, reviewedAt: approved, waitMs: 24 * HOUR });

describe("deciding Can't find", () => {
  it("waits out the hours after approval before flagging anything", () => {
    expect(decide(fresh, missing, at(23 * HOUR))).toMatchObject({ alert: false, changed: false });
    const flagged = decide(fresh, missing, at(25 * HOUR));
    expect(flagged).toMatchObject({ alert: true, changed: true });
    expect(flagged.state).toEqual({ since: at(25 * HOUR), alerts: 1, alertedAt: at(25 * HOUR), dismissedAt: null });
  });

  it("alerts once, then keeps quiet while it stays missing", () => {
    const first = decide(fresh, missing, at(25 * HOUR)).state;
    const next = decide(first, missing, at(26 * HOUR));
    expect(next).toMatchObject({ alert: false, changed: false });
    expect(next.state.since).toEqual(first.since);
  });

  it("reminds once more a week after the first alert, and never again", () => {
    const first = decide(fresh, missing, at(25 * HOUR)).state;
    expect(decide(first, missing, at(25 * HOUR + 6 * DAY)).alert).toBe(false);
    const second = decide(first, missing, at(25 * HOUR + 7 * DAY));
    expect(second.alert).toBe(true);
    expect(second.state.alerts).toBe(2);
    expect(decide(second.state, missing, at(25 * HOUR + 30 * DAY)).alert).toBe(false);
  });

  it("clears as soon as something is found, keeping the alert count", () => {
    const first = decide(fresh, missing, at(25 * HOUR)).state;
    const cleared = decide(first, { kind: "found" }, at(30 * HOUR));
    expect(cleared).toMatchObject({ cleared: true, changed: true, alert: false });
    expect(cleared.state).toMatchObject({ since: null, alerts: 1 });
    // Missing again (a failed download): listed again, but no fresh alert
    // until the week is up — a flapping title can't spam.
    const again = decide(cleared.state, missing, at(40 * HOUR));
    expect(again).toMatchObject({ alert: false, changed: true });
    expect(again.state.since).toEqual(at(40 * HOUR));
  });

  it("does nothing for a found title that was never flagged", () => {
    expect(decide(fresh, { kind: "found" }, at(30 * HOUR))).toMatchObject({ changed: false, cleared: false });
  });

  it("leaves everything alone when it can't tell (unreleased, server down)", () => {
    const first = decide(fresh, missing, at(25 * HOUR)).state;
    expect(decide(first, { kind: "unknown" }, at(30 * HOUR))).toMatchObject({ changed: false, state: first });
    expect(decide(fresh, { kind: "unknown" }, at(30 * HOUR))).toMatchObject({ changed: false, alert: false });
  });

  it("never touches a dismissed request", () => {
    const dismissed = { ...fresh, dismissedAt: at(2 * DAY) };
    expect(decide(dismissed, missing, at(10 * DAY))).toMatchObject({ changed: false, alert: false });
  });

  it("needs an approval time", () => {
    expect(
      decideNotFound(fresh, missing, { now: at(10 * DAY), reviewedAt: null, waitMs: HOUR }),
    ).toMatchObject({ changed: false });
  });
});

describe("reading Radarr", () => {
  const movie = { id: 7, tmdbId: 425, titleSlug: "425", status: "released", isAvailable: true, monitored: true, hasFile: false };

  it("calls a released, monitored movie with no file and nothing downloading missing", () => {
    expect(observeMovie(movie, false)).toEqual({ kind: "missing", seasons: null, arrPath: "/movie/425" });
  });

  it("counts a file or a download in the queue as found", () => {
    expect(observeMovie({ ...movie, hasFile: true }, false)).toEqual({ kind: "found" });
    expect(observeMovie(movie, true)).toEqual({ kind: "found" });
  });

  it("leaves unreleased movies to Coming soon", () => {
    for (const status of ["tba", "announced", "inCinemas"]) {
      expect(observeMovie({ ...movie, status }, false)).toEqual({ kind: "unknown" });
    }
    expect(observeMovie({ ...movie, isAvailable: false }, false)).toEqual({ kind: "unknown" });
  });

  it("ignores an unmonitored or absent movie", () => {
    expect(observeMovie({ ...movie, monitored: false }, false)).toEqual({ kind: "unknown" });
    expect(observeMovie(null, false)).toEqual({ kind: "unknown" });
  });

  it("links by tmdb id when Radarr sends no slug", () => {
    expect(observeMovie({ ...movie, titleSlug: undefined }, false)).toMatchObject({ arrPath: "/movie/425" });
  });
});

describe("reading Sonarr", () => {
  const season = (seasonNumber: number, episodeCount: number, episodeFileCount: number, monitored = true) => ({
    seasonNumber,
    monitored,
    statistics: { episodeCount, episodeFileCount },
  });
  const series = {
    id: 3,
    titleSlug: "severance",
    status: "continuing",
    monitored: true,
    seasons: [season(0, 2, 0, false), season(1, 9, 9), season(2, 10, 0), season(3, 0, 0)],
  };

  it("flags the requested seasons that aired with no file at all", () => {
    expect(observeSeries(series, false, [2])).toEqual({ kind: "missing", seasons: [2], arrPath: "/series/severance" });
  });

  it("calls a requested season found once any of it is on disk", () => {
    expect(observeSeries(series, false, [1])).toEqual({ kind: "found" });
    const partial = { ...series, seasons: [season(2, 10, 3)] };
    expect(observeSeries(partial, false, [2])).toEqual({ kind: "found" });
  });

  it("leaves a season that hasn't aired to Coming soon", () => {
    expect(observeSeries(series, false, [3])).toEqual({ kind: "unknown" });
    expect(observeSeries({ ...series, status: "upcoming" }, false, [2])).toEqual({ kind: "unknown" });
  });

  it("counts anything downloading as found", () => {
    expect(observeSeries(series, true, [2])).toEqual({ kind: "found" });
  });

  it("checks every monitored season but specials for a whole-series request", () => {
    expect(observeSeries(series, false, null)).toEqual({ kind: "missing", seasons: [2], arrPath: "/series/severance" });
    const nothing = { ...series, seasons: [season(1, 8, 0), season(2, 10, 0)] };
    expect(observeSeries(nothing, false, null)).toEqual({ kind: "missing", seasons: null, arrPath: "/series/severance" });
  });

  it("ignores an unmonitored or absent show", () => {
    expect(observeSeries({ ...series, monitored: false }, false, [2])).toEqual({ kind: "unknown" });
    expect(observeSeries(null, false, [2])).toEqual({ kind: "unknown" });
  });
});

describe("the setting and the words", () => {
  it("defaults and clamps the hours", () => {
    expect(notFoundAfterHours(null)).toBe(24);
    expect(notFoundAfterHours(0)).toBe(1);
    expect(notFoundAfterHours(10_000)).toBe(720);
    expect(notFoundAfterHours(48)).toBe(48);
  });

  it("checks the hours a client sends", () => {
    expect(parseNotFoundAfterHours(12)).toEqual({ ok: true, hours: 12 });
    expect(parseNotFoundAfterHours(0).ok).toBe(false);
    expect(parseNotFoundAfterHours(1.5).ok).toBe(false);
    expect(parseNotFoundAfterHours("12").ok).toBe(false);
  });

  it("names the title the way the alert does", () => {
    expect(notFoundName("Ice Age", 2002, null, null)).toBe("Ice Age (2002)");
    expect(notFoundName("Severance", 2022, [2], "Season 2")).toBe("Severance (Season 2)");
    expect(notFoundName("Mystery", null, null, null)).toBe("Mystery");
  });

  it("says how long it's been missing", () => {
    const since = new Date("2026-09-01T00:00:00Z");
    expect(notFoundAgeLabel(since, new Date(since.getTime() + 20 * 60_000))).toBe("under an hour");
    expect(notFoundAgeLabel(since, new Date(since.getTime() + 5 * HOUR))).toBe("5 hours");
    expect(notFoundAgeLabel(since, new Date(since.getTime() + 3 * DAY))).toBe("3 days");
  });

  it("builds the Sonarr/Radarr link only when it can", () => {
    expect(arrTitleUrl("http://radarr:7878/", "/movie/425")).toBe("http://radarr:7878/movie/425");
    expect(arrTitleUrl(null, "/movie/425")).toBeNull();
    expect(arrTitleUrl("http://radarr:7878", null)).toBeNull();
  });
});
