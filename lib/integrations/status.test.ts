import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());

import { withQueueStatus, type TitleLibraryStatus } from "@/lib/integrations/status";

const live = (status: TitleLibraryStatus["status"]): TitleLibraryStatus => ({
  status,
  provider: "radarr",
  configured: true,
  file: null,
});

describe("withQueueStatus", () => {
  it("shows a download Sonarr/Radarr's own records don't know about yet, with its progress", () => {
    expect(withQueueStatus(live("tracked_monitored"), { status: "tracked_downloading", downloadProgress: 42 })).toMatchObject({
      status: "tracked_downloading",
      downloadProgress: 42,
    });
  });

  it("shows a finished download waiting to be moved", () => {
    expect(withQueueStatus(live("tracked_monitored"), { status: "ready_to_move", downloadProgress: null })).toMatchObject({
      status: "ready_to_move",
    });
  });

  it("keeps an owned copy owned, and the live answer when the cache has nothing to add", () => {
    expect(withQueueStatus(live("owned"), { status: "ready_to_move", downloadProgress: null }).status).toBe("owned");
    expect(withQueueStatus(live("tracked_monitored"), { status: "tracked_monitored", downloadProgress: null }).status).toBe(
      "tracked_monitored",
    );
    expect(withQueueStatus(live("coming_soon"), null).status).toBe("coming_soon");
  });
});
