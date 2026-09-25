import { describe, it, expect } from "vitest";
import { computeCalendarGrid, episodeDateKey, monthParam, toDateKey } from "./grid";

// All dates here are constructed in local time, like the page, so the tests
// hold in any server time zone.
describe("computeCalendarGrid", () => {
  const now = new Date(2026, 8, 17, 15, 30); // 17 Sep 2026, local

  it("defaults to the current month", () => {
    const grid = computeCalendarGrid(undefined, now);
    expect(monthParam(grid.year, grid.monthIndex)).toBe("2026-09");
    expect(grid.todayKey).toBe("2026-09-17");
  });

  it("spans Sunday before the 1st through Saturday after the last day", () => {
    const grid = computeCalendarGrid("2026-09", now);
    expect(toDateKey(grid.gridStart)).toBe("2026-08-30");
    expect(grid.gridStart.getDay()).toBe(0);
    expect(toDateKey(grid.gridEnd)).toBe("2026-10-03");
    expect(grid.gridEnd.getDay()).toBe(6);
    expect(grid.gridEnd.getHours()).toBe(23);
    expect(grid.days).toHaveLength(35);
    expect(grid.days.length % 7).toBe(0);
  });

  it("wraps prev/next across year boundaries", () => {
    const january = computeCalendarGrid("2027-01", now);
    expect(january.prevMonth).toBe("2026-12");
    expect(january.nextMonth).toBe("2027-02");
    const december = computeCalendarGrid("2026-12", now);
    expect(december.nextMonth).toBe("2027-01");
  });

  it("falls back to the current month for an unparseable query", () => {
    const grid = computeCalendarGrid("next-month", now);
    expect(monthParam(grid.year, grid.monthIndex)).toBe("2026-09");
  });
});

describe("episodeDateKey", () => {
  it("prefers Sonarr's local airDate over the UTC instant", () => {
    // A 9pm Eastern broadcast is already the next day in UTC.
    expect(episodeDateKey({ airDate: "2026-09-17", airDateUtc: "2026-09-18T01:00:00Z" })).toBe("2026-09-17");
  });

  it("falls back to the server-local day of airDateUtc, matching the grid", () => {
    const instant = new Date(2026, 8, 17, 21, 0); // 9pm local
    expect(episodeDateKey({ airDateUtc: instant.toISOString() })).toBe("2026-09-17");
    expect(episodeDateKey({ airDateUtc: instant.toISOString() })).toBe(toDateKey(instant));
  });

  it("returns null with no usable date", () => {
    expect(episodeDateKey({})).toBeNull();
    expect(episodeDateKey({ airDateUtc: "not a date" })).toBeNull();
  });
});
