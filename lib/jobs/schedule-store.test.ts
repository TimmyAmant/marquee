import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());

import { resetTestDatabase } from "@/lib/test/pglite";
import { getStoredJobSchedules, saveJobSchedule } from "@/lib/jobs/schedule-store";
import { effectiveSchedule } from "@/lib/jobs/schedule";

beforeEach(async () => {
  await resetTestDatabase();
});

describe("saving a job's schedule", () => {
  it("keeps only the jobs that differ from their defaults", async () => {
    expect(await saveJobSchedule("plex-sync", { every: "hours", count: 6 })).toMatchObject({ ok: true });
    expect(await saveJobSchedule("cleanup", { dailyAt: { hour: 4, minute: 15 } })).toMatchObject({ ok: true });
    expect(await getStoredJobSchedules()).toEqual({
      "plex-sync": { every: "hours", count: 6 },
      cleanup: { dailyAt: { hour: 4, minute: 15 } },
    });
    // Back to the default: by name, or by picking it again.
    await saveJobSchedule("plex-sync", null);
    await saveJobSchedule("cleanup", { dailyAt: { hour: 3, minute: 30 } });
    expect(await getStoredJobSchedules()).toEqual({});
  });

  it("refuses what isn't a preset and leaves the schedule alone", async () => {
    await saveJobSchedule("trakt-sync", { every: "hours", count: 12 });
    expect(await saveJobSchedule("trakt-sync", { every: "minutes", count: 1 })).toMatchObject({ ok: false, code: "invalid" });
    expect(effectiveSchedule("trakt-sync", await getStoredJobSchedules())).toEqual({ every: "hours", count: 12 });
  });
});
