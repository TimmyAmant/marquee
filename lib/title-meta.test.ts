import { describe, it, expect } from "vitest";
import { computeYearRange, relabelTvStatus } from "./title-meta";

describe("computeYearRange", () => {
  it("returns a single year for a movie (no end year)", () => {
    expect(computeYearRange("2026", null)).toBe("2026");
  });

  it("returns a range for an ended show", () => {
    expect(computeYearRange("2001", "2011")).toBe("2001–2011");
  });

  it("returns just the start year when start and end are the same", () => {
    expect(computeYearRange("2026", "2026")).toBe("2026");
  });

  it("returns just the end year when the start year is missing — this was the 'null–2020' bug", () => {
    expect(computeYearRange(null, "2020")).toBe("2020");
  });

  it("returns null when neither year is known", () => {
    expect(computeYearRange(null, null)).toBeNull();
  });
});

describe("relabelTvStatus", () => {
  it("relabels TMDb's 'Returning Series' to 'Continuing'", () => {
    expect(relabelTvStatus("Returning Series")).toBe("Continuing");
  });

  it("passes other statuses through unchanged", () => {
    expect(relabelTvStatus("Ended")).toBe("Ended");
    expect(relabelTvStatus("Canceled")).toBe("Canceled");
  });

  it("passes null through", () => {
    expect(relabelTvStatus(null)).toBeNull();
  });
});
