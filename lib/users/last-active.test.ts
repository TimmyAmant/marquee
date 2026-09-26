import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));
import { LAST_ACTIVE_INTERVAL_MS, shouldRecordActivity } from "./last-active";

describe("shouldRecordActivity", () => {
  const now = new Date("2026-09-25T20:00:00Z");

  it("records the first time, and once the last record is a few minutes old", () => {
    expect(shouldRecordActivity(null, now)).toBe(true);
    expect(shouldRecordActivity(new Date(now.getTime() - LAST_ACTIVE_INTERVAL_MS), now)).toBe(true);
  });

  it("skips while the last record is recent", () => {
    expect(shouldRecordActivity(new Date(now.getTime() - 60_000), now)).toBe(false);
  });
});
