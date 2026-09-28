import { describe, expect, it } from "vitest";
import {
  DEFAULT_JOB_SCHEDULES,
  JOB_IDS,
  cronExpression,
  effectiveSchedule,
  nextRunAfter,
  parseJobSchedule,
} from "@/lib/jobs/schedule";

// Local times throughout: node-cron runs on the server's clock, and so does
// the next-run arithmetic.
const at = (h: number, m: number, day = 27) => new Date(2026, 8, day, h, m, 30);

describe("parseJobSchedule", () => {
  it("takes the presets and a time of day", () => {
    expect(parseJobSchedule({ every: "minutes", count: 15 })).toEqual({ ok: true, schedule: { every: "minutes", count: 15 } });
    expect(parseJobSchedule({ every: "hours", count: 6 })).toEqual({ ok: true, schedule: { every: "hours", count: 6 } });
    expect(parseJobSchedule({ dailyAt: { hour: 23, minute: 59 } })).toEqual({
      ok: true,
      schedule: { dailyAt: { hour: 23, minute: 59 } },
    });
  });

  it("refuses anything else", () => {
    for (const bad of [
      null,
      "hourly",
      { every: "minutes", count: 1 },
      { every: "minutes", count: 7 },
      { every: "hours", count: 5 },
      { every: "hours", count: 24 },
      { every: "days", count: 1 },
      { dailyAt: { hour: 24, minute: 0 } },
      { dailyAt: { hour: 3, minute: 1.5 } },
      { dailyAt: { hour: "3", minute: 0 } },
    ]) {
      expect(parseJobSchedule(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("effectiveSchedule", () => {
  it("uses the admin's choice, or the default when there's none or it's broken", () => {
    expect(effectiveSchedule("plex-sync", { "plex-sync": { every: "hours", count: 2 } })).toEqual({ every: "hours", count: 2 });
    expect(effectiveSchedule("plex-sync", {})).toEqual(DEFAULT_JOB_SCHEDULES["plex-sync"].schedule);
    expect(effectiveSchedule("plex-sync", { "plex-sync": { every: "hours", count: 5 } })).toEqual({ every: "hours", count: 1 });
  });
});

describe("cronExpression", () => {
  it("keeps the built-in schedules the jobs always had", () => {
    const expressions = Object.fromEntries(
      JOB_IDS.map((id) => [id, cronExpression(DEFAULT_JOB_SCHEDULES[id].schedule, DEFAULT_JOB_SCHEDULES[id].offset)]),
    );
    expect(expressions).toEqual({
      "plex-sync": "0 * * * *",
      "jellyfin-sync": "0 * * * *",
      "arr-sync": "0 * * * *",
      "plex-watchlist": "5-59/10 * * * *",
      "trakt-sync": "40 */3 * * *",
      "not-found-check": "20 * * * *",
      "disk-space-snapshot": "0 3 * * *",
      cleanup: "30 3 * * *",
    });
  });

  it("keeps a job's minute past the hour when its interval changes", () => {
    expect(cronExpression({ every: "hours", count: 6 }, 20)).toBe("20 */6 * * *");
    expect(cronExpression({ every: "minutes", count: 15 }, 20)).toBe("5-59/15 * * * *");
    expect(cronExpression({ every: "minutes", count: 30 }, 0)).toBe("0-59/30 * * * *");
  });
});

describe("nextRunAfter", () => {
  it("finds the next minute the job runs at", () => {
    expect(nextRunAfter({ every: "hours", count: 1 }, 20, at(9, 5))).toEqual(new Date(2026, 8, 27, 9, 20));
    expect(nextRunAfter({ every: "hours", count: 1 }, 20, at(9, 20))).toEqual(new Date(2026, 8, 27, 10, 20));
    expect(nextRunAfter({ every: "hours", count: 3 }, 40, at(10, 0))).toEqual(new Date(2026, 8, 27, 12, 40));
    expect(nextRunAfter({ every: "minutes", count: 10 }, 5, at(9, 7))).toEqual(new Date(2026, 8, 27, 9, 15));
  });

  it("goes to tomorrow for a daily time that's passed", () => {
    expect(nextRunAfter({ dailyAt: { hour: 3, minute: 30 } }, 0, at(2, 0))).toEqual(new Date(2026, 8, 27, 3, 30));
    expect(nextRunAfter({ dailyAt: { hour: 3, minute: 30 } }, 0, at(4, 0))).toEqual(new Date(2026, 8, 28, 3, 30));
  });
});
