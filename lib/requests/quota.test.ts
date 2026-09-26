import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { computeQuota, quotaExceededMessage } from "./quota";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-26T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY);

describe("computeQuota", () => {
  it("counts only requests inside the window", () => {
    expect(computeQuota(5, 7, [ago(1), ago(3), ago(8)], now)).toEqual({
      limit: 5,
      days: 7,
      used: 2,
      remaining: 3,
      nextSlotAt: null,
    });
  });

  it("says when the next slot frees up once none is left", () => {
    const quota = computeQuota(2, 7, [ago(1), ago(5), ago(3)], now);
    expect(quota).toMatchObject({ used: 3, remaining: 0 });
    // Three used with a limit of two: two have to age out; the second-oldest
    // (3 days ago) frees the slot in 4 days.
    expect(quota.nextSlotAt).toEqual(new Date(ago(3).getTime() + 7 * DAY));
    expect(computeQuota(2, 7, [ago(1), ago(5)], now).nextSlotAt).toEqual(new Date(ago(5).getTime() + 7 * DAY));
  });
});

describe("quotaExceededMessage", () => {
  it("reads naturally", () => {
    const full = computeQuota(5, 7, [ago(6), ago(5), ago(4), ago(3), ago(2)], now);
    expect(quotaExceededMessage("movie", full)).toBe("You've used your 5 movie requests for a week. You can ask again on Sep 27.");
    expect(quotaExceededMessage("tv", computeQuota(1, 30, [ago(2)], now))).toMatch(/^You've used your 1 TV request for 30 days\./);
  });
});
