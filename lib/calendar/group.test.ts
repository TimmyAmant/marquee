import { describe, expect, it } from "vitest";
import { groupDayEntries, mergedSubtitle } from "./group";

const entry = (tmdbId: number, subtitle: string, mediaType = "tv") => ({
  mediaType,
  tmdbId,
  name: `Show ${tmdbId}`,
  posterPath: null,
  subtitle,
});

describe("calendar day grouping", () => {
  it("merges one show's episodes into a range", () => {
    const groups = groupDayEntries([entry(1, "S01E03"), entry(2, "S02E01"), entry(1, "S01E04"), entry(1, "S01E06")]);
    expect(groups.map((g) => [g.first.tmdbId, g.subtitle])).toEqual([
      [1, "S01E03–E06"],
      [2, "S02E01"],
    ]);
  });

  it("lists codes across seasons and release types", () => {
    expect(mergedSubtitle(["S01E10", "S02E01"])).toBe("S01E10 · S02E01");
    expect(mergedSubtitle(["In theaters", "Digital release"])).toBe("In theaters · Digital release");
  });

  it("keeps a movie and a show with the same id apart", () => {
    expect(groupDayEntries([entry(5, "S01E01"), entry(5, "In theaters", "movie")])).toHaveLength(2);
  });
});
