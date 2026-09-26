import { describe, it, expect } from "vitest";
import { toYear, arrRowStatus, isDroppedArrRow, isPossibleDuplicate } from "./query-policy";

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
  it("is dropped when the sync wrote tracked_unmonitored (or the older untracked)", () => {
    expect(isDroppedArrRow("tracked_unmonitored", false)).toBe(true);
    expect(isDroppedArrRow("untracked", false)).toBe(true);
    expect(isDroppedArrRow("untracked", null)).toBe(true);
  });

  it("is NOT dropped once Start monitoring flipped the flag back on", () => {
    expect(isDroppedArrRow("tracked_unmonitored", true)).toBe(false);
    expect(isDroppedArrRow("untracked", true)).toBe(false);
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

describe("arrRowStatus", () => {
  it("reads unmonitored rows with nothing on disk as tracked_unmonitored, whatever shape they were cached in", () => {
    expect(arrRowStatus("tracked_unmonitored", false)).toBe("tracked_unmonitored");
    expect(arrRowStatus("untracked", false)).toBe("tracked_unmonitored");
    expect(arrRowStatus("tracked_monitored", false)).toBe("tracked_unmonitored");
    expect(arrRowStatus("coming_soon", false)).toBe("tracked_unmonitored");
  });

  it("keeps a file on disk whatever the monitored flag says", () => {
    expect(arrRowStatus("owned", false)).toBe("owned");
    expect(arrRowStatus("tracked_downloading", false)).toBe("tracked_downloading");
  });

  it("passes monitored statuses through", () => {
    expect(arrRowStatus("tracked_monitored", true)).toBe("tracked_monitored");
    expect(arrRowStatus("coming_soon", true)).toBe("coming_soon");
    expect(arrRowStatus("owned", true)).toBe("owned");
    expect(arrRowStatus(null, null)).toBe("tracked_monitored");
  });

  it("treats an unmonitored row monitored again (before the next sync) as missing", () => {
    expect(arrRowStatus("tracked_unmonitored", true)).toBe("tracked_monitored");
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
