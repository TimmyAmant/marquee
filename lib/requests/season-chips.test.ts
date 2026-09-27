import { describe, expect, it } from "vitest";
import { seasonChips } from "./season-chips";

describe("season chips", () => {
  it("is empty for a whole series or a movie", () => {
    expect(seasonChips(null)).toEqual([]);
    expect(seasonChips([])).toEqual([]);
  });

  it("makes one chip per season, sorted and deduplicated", () => {
    expect(seasonChips([3, 1, 1, 2])).toEqual(["S1", "S2", "S3"]);
  });

  it("shortens a long run to a range", () => {
    expect(seasonChips([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual(["S1–S9"]);
  });
});
