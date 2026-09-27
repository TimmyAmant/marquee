import { describe, expect, it } from "vitest";
import {
  completionAction,
  completionVerdict,
  coversSeason,
  episodesComplete,
  type EpisodeFacts,
} from "./complete-rules";

const now = new Date("2026-09-27T12:00:00Z");
const past = "2026-01-01T02:00:00Z";
const future = "2026-12-01T02:00:00Z";

function ep(seasonNumber: number, hasFile: boolean, airDateUtc: string | null = past, monitored = true): EpisodeFacts {
  return { seasonNumber, hasFile, monitored, airDateUtc };
}

describe("coversSeason", () => {
  it("covers every season but specials for a whole-show request", () => {
    expect(coversSeason(null, 1)).toBe(true);
    expect(coversSeason(null, 7)).toBe(true);
    expect(coversSeason(null, 0)).toBe(false);
  });

  it("covers only the seasons named, specials included when named", () => {
    expect(coversSeason([2], 1)).toBe(false);
    expect(coversSeason([2], 2)).toBe(true);
    expect(coversSeason([0, 2], 0)).toBe(true);
  });
});

describe("episodesComplete", () => {
  it("is complete when every aired episode has a file", () => {
    expect(episodesComplete([ep(1, true), ep(1, true), ep(2, true)], null, now)).toBe(true);
  });

  it("isn't while an aired episode is still missing", () => {
    expect(episodesComplete([ep(1, true), ep(1, false)], null, now)).toBe(false);
  });

  it("doesn't wait for episodes that haven't aired, or have no date yet", () => {
    const episodes = [ep(1, true), ep(1, true), ep(1, false, future), ep(1, false, null)];
    expect(episodesComplete(episodes, null, now)).toBe(true);
  });

  it("ignores specials unless they were asked for", () => {
    const episodes = [ep(0, false), ep(1, true)];
    expect(episodesComplete(episodes, null, now)).toBe(true);
    expect(episodesComplete(episodes, [1], now)).toBe(true);
    expect(episodesComplete(episodes, [0, 1], now)).toBe(false);
  });

  it("judges only the seasons a season request covers", () => {
    const episodes = [ep(1, false), ep(1, false), ep(2, true), ep(2, true), ep(3, false, future)];
    expect(episodesComplete(episodes, [2], now)).toBe(true);
    expect(episodesComplete(episodes, [2, 3], now)).toBe(true);
    expect(episodesComplete(episodes, [1, 2], now)).toBe(false);
    expect(episodesComplete(episodes, null, now)).toBe(false);
  });

  it("isn't ready when nothing it covers has aired yet", () => {
    expect(episodesComplete([ep(1, true), ep(2, false, future)], [2], now)).toBe(false);
    expect(episodesComplete([], null, now)).toBe(false);
  });

  it("doesn't wait on an aired episode Sonarr was told to skip", () => {
    const skipped = ep(1, false, past, false);
    expect(episodesComplete([ep(1, true), skipped], null, now)).toBe(true);
    // One that's unmonitored but on disk still counts.
    expect(episodesComplete([ep(1, true, past, false)], null, now)).toBe(true);
    // Only skipped ones: nothing to be ready with.
    expect(episodesComplete([skipped], null, now)).toBe(false);
  });
});

describe("completionVerdict", () => {
  it("follows the movie's file", () => {
    expect(completionVerdict({ kind: "movie", hasFile: true }, null, now)).toBe("complete");
    expect(completionVerdict({ kind: "movie", hasFile: false }, null, now)).toBe("incomplete");
  });

  it("is complete when any one server has the whole show", () => {
    const partial = [ep(1, true), ep(1, false)];
    const whole = [ep(1, true), ep(1, true)];
    expect(completionVerdict({ kind: "tv", copies: [partial] }, null, now)).toBe("incomplete");
    expect(completionVerdict({ kind: "tv", copies: [partial, whole] }, null, now)).toBe("complete");
    expect(completionVerdict({ kind: "tv", copies: [] }, null, now)).toBe("incomplete");
  });

  it("knows nothing when nothing answered", () => {
    expect(completionVerdict({ kind: "unknown" }, null, now)).toBe("unknown");
  });
});

describe("completionAction", () => {
  it("announces an armed request once it's complete", () => {
    expect(completionAction("complete", true)).toBe("announce");
    expect(completionAction("incomplete", true)).toBe("none");
    expect(completionAction("unknown", true)).toBe("none");
  });

  it("quietly marks an older request that's already complete, and arms one that isn't", () => {
    expect(completionAction("complete", false)).toBe("mark");
    expect(completionAction("incomplete", false)).toBe("arm");
    expect(completionAction("unknown", false)).toBe("none");
  });
});
