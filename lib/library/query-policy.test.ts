import { describe, it, expect } from "vitest";
import { toYear, isDroppedArrRow, isPossibleDuplicate } from "./query-policy";

describe("toYear", () => {
  it("prefers releaseDate over firstAirDate", () => {
    expect(toYear({ releaseDate: "2026-01-15", firstAirDate: "2020-01-01" })).toBe("2026");
  });

  it("falls back to firstAirDate when releaseDate is absent", () => {
    expect(toYear({ releaseDate: null, firstAirDate: "2020-05-01" })).toBe("2020");
  });

  it("returns null when both are missing", () => {
    expect(toYear({ releaseDate: null, firstAirDate: null })).toBeNull();
  });

  it("returns null for empty-string dates rather than an empty string", () => {
    expect(toYear({ releaseDate: "", firstAirDate: "" })).toBeNull();
  });
});

describe("isDroppedArrRow", () => {
  it("is dropped when status is untracked", () => {
    expect(isDroppedArrRow("untracked", true)).toBe(true);
  });

  it("is dropped for tracked_monitored with monitoring off", () => {
    expect(isDroppedArrRow("tracked_monitored", false)).toBe(true);
  });

  it("is dropped for coming_soon with monitoring off", () => {
    expect(isDroppedArrRow("coming_soon", false)).toBe(true);
  });

  it("is NOT dropped for tracked_monitored while still monitored", () => {
    expect(isDroppedArrRow("tracked_monitored", true)).toBe(false);
  });

  it("is NOT dropped for owned even if monitored is false — a real file on disk always stays visible", () => {
    expect(isDroppedArrRow("owned", false)).toBe(false);
  });

  it("is NOT dropped for tracked_downloading even if monitored is false", () => {
    expect(isDroppedArrRow("tracked_downloading", false)).toBe(false);
  });

  it("is NOT dropped when monitored is null (unknown) rather than explicitly false", () => {
    expect(isDroppedArrRow("tracked_monitored", null)).toBe(false);
  });
});

describe("isPossibleDuplicate", () => {
  it("is true when both paths are present and differ", () => {
    expect(isPossibleDuplicate("/movies/A/old.mkv", "/movies/A/new.mkv")).toBe(true);
  });

  it("is false when both paths are present and identical (same file, just reported twice)", () => {
    expect(isPossibleDuplicate("/movies/A/file.mkv", "/movies/A/file.mkv")).toBe(false);
  });

  it("is false when either path is missing", () => {
    expect(isPossibleDuplicate(null, "/movies/A/file.mkv")).toBe(false);
    expect(isPossibleDuplicate("/movies/A/file.mkv", null)).toBe(false);
    expect(isPossibleDuplicate(null, null)).toBe(false);
  });
});
