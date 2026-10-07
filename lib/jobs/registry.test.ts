import { describe, expect, it, vi } from "vitest";

// A job never runs twice at once, however it was started: the scheduler and
// Run now share runRecorded's one "running" set. The jobs themselves are
// stubbed; the cleanup job stands in for all of them.

const cleanup = vi.hoisted(() => {
  let release: () => void = () => undefined;
  return {
    calls: 0,
    run: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          cleanup.calls++;
          release = resolve;
        }),
    ),
    finish: () => release(),
  };
});

vi.mock("@/lib/plex/sync", () => ({ syncAllConnectedPlexUsers: async () => undefined }));
vi.mock("@/lib/jellyfin/sync", () => ({ syncAllConnectedJellyfinUsers: async () => undefined }));
vi.mock("@/lib/arr/sync", () => ({ syncAllConnectedArrUsers: async () => undefined }));
vi.mock("@/lib/arr/media-server-check", () => ({ checkArrAgainstMediaServers: async () => undefined }));
vi.mock("@/lib/integrations/disk-space", () => ({ snapshotDiskSpaceForAllConnectedUsers: async () => undefined }));
vi.mock("@/lib/jobs/cleanup", () => ({ pruneOldRecords: cleanup.run }));
vi.mock("@/lib/plex/watchlist", () => ({ syncAllPlexWatchlists: async () => undefined }));
vi.mock("@/lib/trakt/sync", () => ({ syncAllTraktSyncs: async () => undefined }));
vi.mock("@/lib/requests/not-found", () => ({ checkNotFoundRequests: async () => undefined }));
vi.mock("@/lib/requests/complete", () => ({ checkCompletedRequests: async () => undefined }));
vi.mock("@/lib/i18n/server", () => ({ getT: async () => (key: string) => key }));

import { englishT } from "@/lib/i18n/catalog";
import { jobDefinitions, runJob, runRecorded, scheduleText } from "./registry";

describe("runRecorded / runJob", () => {
  it("won't start a job that's already running, and runs it again once it's done", async () => {
    const first = runRecorded("cleanup");
    // A scheduled run arriving mid-run is skipped…
    expect(await runRecorded("cleanup")).toBe(false);
    // …and so is Run now.
    expect(await runJob("cleanup")).toMatchObject({ ok: false, code: "conflict", error: "admin.jobAlreadyRunning" });
    expect(cleanup.calls).toBe(1);

    cleanup.finish();
    expect(await first).toBe(true);

    const again = runJob("cleanup");
    await vi.waitFor(() => expect(cleanup.calls).toBe(2));
    cleanup.finish();
    expect(await again).toEqual({ ok: true });
  });
});

describe("scheduleText", () => {
  it("names the zone a daily time runs in", () => {
    const t = englishT();
    expect(scheduleText(t, { dailyAt: { hour: 3, minute: 30 } }, "America/New_York")).toBe(
      "Daily at 3:30 AM (America/New_York)",
    );
    expect(scheduleText(t, { every: "hours", count: 2 }, "UTC")).toBe("Every 2 hours");
  });

  it("uses the server's own zone, and lists it on every job", () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const job = jobDefinitions(englishT()).find((job) => job.id === "cleanup")!;
    expect(job.timeZone).toBe(zone);
    expect(job.schedule).toBe(`Daily at 3:30 AM (${zone})`);
  });
});
