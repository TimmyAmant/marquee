import { describe, expect, it } from "vitest";
import { issueEpisodeLabel, parseReport, MAX_ISSUE_MESSAGE } from "./labels";

describe("parseReport", () => {
  it("takes a kind, an optional note, and for TV an optional season and episode", () => {
    expect(parseReport("tv", { kind: "audio", message: "  Out of sync  ", seasonNumber: 2, episodeNumber: "5" })).toEqual({
      ok: true,
      kind: "audio",
      message: "Out of sync",
      seasonNumber: 2,
      episodeNumber: 5,
    });
    expect(parseReport("tv", { kind: "video", seasonNumber: 3 })).toMatchObject({ ok: true, seasonNumber: 3, episodeNumber: null, message: null });
  });

  it("ignores season and episode on a movie", () => {
    expect(parseReport("movie", { kind: "wont_play", seasonNumber: 1, episodeNumber: 2 })).toMatchObject({
      ok: true,
      seasonNumber: null,
      episodeNumber: null,
    });
  });

  it("says what's missing or wrong", () => {
    expect(parseReport("movie", { kind: "broken" })).toMatchObject({ ok: false, error: "Pick what's wrong." });
    expect(parseReport("movie", { kind: "other" })).toMatchObject({ ok: false, error: "Say what's wrong." });
    expect(parseReport("movie", { kind: "other", message: "x".repeat(MAX_ISSUE_MESSAGE + 1) })).toMatchObject({ ok: false });
    expect(parseReport("tv", { kind: "audio", episodeNumber: 4 })).toMatchObject({ ok: false, error: "Pick the season too." });
    expect(parseReport("tv", { kind: "audio", seasonNumber: -1 })).toMatchObject({ ok: false });
    expect(parseReport("tv", { kind: "audio", seasonNumber: 1.5 })).toMatchObject({ ok: false });
  });
});

describe("issueEpisodeLabel", () => {
  it("names the season or episode", () => {
    expect(issueEpisodeLabel(null, null)).toBeNull();
    expect(issueEpisodeLabel(2, null)).toBe("Season 2");
    expect(issueEpisodeLabel(0, null)).toBe("Specials");
    expect(issueEpisodeLabel(2, 5)).toBe("S2 E5");
  });
});
