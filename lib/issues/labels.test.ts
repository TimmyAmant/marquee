import { describe, expect, it } from "vitest";
import { issueEpisodeLabel, parseReport, MAX_ISSUE_MESSAGE } from "./labels";
import { englishT } from "@/lib/i18n/catalog";

const t = englishT();

describe("parseReport", () => {
  it("takes a kind, an optional note, and for TV an optional season and episode", () => {
    expect(parseReport(t, "tv", { kind: "audio", message: "  Out of sync  ", seasonNumber: 2, episodeNumber: "5" })).toEqual({
      ok: true,
      kind: "audio",
      message: "Out of sync",
      seasonNumber: 2,
      episodeNumber: 5,
    });
    expect(parseReport(t, "tv", { kind: "video", seasonNumber: 3 })).toMatchObject({ ok: true, seasonNumber: 3, episodeNumber: null, message: null });
  });

  it("ignores season and episode on a movie", () => {
    expect(parseReport(t, "movie", { kind: "wont_play", seasonNumber: 1, episodeNumber: 2 })).toMatchObject({
      ok: true,
      seasonNumber: null,
      episodeNumber: null,
    });
  });

  it("says what's missing or wrong", () => {
    expect(parseReport(t, "movie", { kind: "broken" })).toMatchObject({ ok: false, error: "Pick what's wrong." });
    expect(parseReport(t, "movie", { kind: "other" })).toMatchObject({ ok: false, error: "Say what's wrong." });
    expect(parseReport(t, "movie", { kind: "other", message: "x".repeat(MAX_ISSUE_MESSAGE + 1) })).toMatchObject({ ok: false });
    expect(parseReport(t, "tv", { kind: "audio", episodeNumber: 4 })).toMatchObject({ ok: false, error: "Pick the season too." });
    expect(parseReport(t, "tv", { kind: "audio", seasonNumber: -1 })).toMatchObject({ ok: false });
    expect(parseReport(t, "tv", { kind: "audio", seasonNumber: 1.5 })).toMatchObject({ ok: false });
  });
});

describe("issueEpisodeLabel", () => {
  it("names the season or episode", () => {
    expect(issueEpisodeLabel(t, null, null)).toBeNull();
    expect(issueEpisodeLabel(t, 2, null)).toBe("Season 2");
    expect(issueEpisodeLabel(t, 0, null)).toBe("Specials");
    expect(issueEpisodeLabel(t, 2, 5)).toBe("S2 E5");
  });
});
