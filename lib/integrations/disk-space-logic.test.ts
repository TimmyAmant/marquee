import { describe, it, expect } from "vitest";
import { forecastDiskSpace, MIN_DAILY_SHRINK_BYTES, type DiskSpaceSnapshotRow } from "./disk-space-logic";

const GB = 1024 ** 3;

function snap(path: string, freeGb: number, iso: string): DiskSpaceSnapshotRow {
  return { path, freeBytes: freeGb * GB, capturedAt: new Date(iso) };
}

describe("forecastDiskSpace", () => {
  it("needs two distinct days", () => {
    expect(forecastDiskSpace([])).toBeNull();
    expect(forecastDiskSpace([snap("/movies", 100, "2026-09-01T03:00:00Z")])).toBeNull();
  });

  it("draws a line between the oldest and newest day", () => {
    const forecast = forecastDiskSpace([
      snap("/movies", 100, "2026-09-01T03:00:00Z"),
      snap("/movies", 90, "2026-09-11T03:00:00Z"),
    ]);
    expect(forecast?.bytesPerDay).toBe(1 * GB);
    expect(forecast?.daysRemaining).toBe(90);
  });

  it("counts a path once per day, using its latest reading", () => {
    // A manual "Run now" the same day as the cron used to double the day.
    const forecast = forecastDiskSpace([
      snap("/movies", 100, "2026-09-01T03:00:00Z"),
      snap("/movies", 100, "2026-09-01T15:00:00Z"),
      snap("/movies", 91, "2026-09-11T03:00:00Z"),
      snap("/movies", 90, "2026-09-11T18:00:00Z"),
    ]);
    expect(forecast?.bytesPerDay).toBe(1 * GB);
    expect(forecast?.daysRemaining).toBe(90);
  });

  it("ignores paths missing from either end", () => {
    // Sonarr was down for the newest snapshot, so /tv is absent that day —
    // it must not read as 500 GB disappearing.
    const forecast = forecastDiskSpace([
      snap("/movies", 100, "2026-09-01T03:00:00Z"),
      snap("/tv", 500, "2026-09-01T03:00:00Z"),
      snap("/movies", 90, "2026-09-11T03:00:00Z"),
    ]);
    expect(forecast?.bytesPerDay).toBe(1 * GB);
    expect(forecast?.daysRemaining).toBe(90);
  });

  it("returns null when no path is present on both days", () => {
    expect(
      forecastDiskSpace([snap("/movies", 100, "2026-09-01T03:00:00Z"), snap("/tv", 10, "2026-09-11T03:00:00Z")]),
    ).toBeNull();
  });

  it("returns null when space is flat or growing", () => {
    expect(
      forecastDiskSpace([snap("/movies", 100, "2026-09-01T03:00:00Z"), snap("/movies", 120, "2026-09-11T03:00:00Z")]),
    ).toBeNull();
    const barelyShrinking = forecastDiskSpace([
      { path: "/movies", freeBytes: 100 * GB, capturedAt: new Date("2026-09-01T03:00:00Z") },
      { path: "/movies", freeBytes: 100 * GB - MIN_DAILY_SHRINK_BYTES, capturedAt: new Date("2026-09-11T03:00:00Z") },
    ]);
    expect(barelyShrinking).toBeNull();
  });
});
