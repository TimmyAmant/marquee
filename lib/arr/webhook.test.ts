import { beforeEach, describe, expect, it, vi } from "vitest";

// What a Sonarr/Radarr event does once its secret checked out: a Grab is held
// to be confirmed before the admin hears it started downloading
// (lib/arr/grab-notice.ts); a Download tells nobody about the file itself,
// only schedules the "ready to watch" check for the title.

vi.mock("server-only", () => ({}));
const effects = vi.hoisted(() => ({
  createNotification: vi.fn(async (_input: Record<string, unknown>) => true),
  scheduleCompletionCheck: vi.fn(),
  clearNotFoundForTitle: vi.fn(async () => undefined),
  syncArrLibrary: vi.fn(async () => ({ count: 0 })),
  holdGrabNotice: vi.fn(),
}));
vi.mock("@/lib/notifications/query", () => ({ createNotification: effects.createNotification }));
vi.mock("@/lib/requests/complete", () => ({ scheduleCompletionCheck: effects.scheduleCompletionCheck }));
vi.mock("@/lib/requests/not-found", () => ({ clearNotFoundForTitle: effects.clearNotFoundForTitle }));
vi.mock("@/lib/arr/sync", () => ({ syncArrLibrary: effects.syncArrLibrary }));
// The hold itself is lib/arr/grab-notice.test.ts's; here it's only handed the grab.
vi.mock("@/lib/arr/grab-notice", () => ({ holdGrabNotice: effects.holdGrabNotice, episodesLabel: () => null }));
vi.mock("@/lib/tmdb/cross-reference", () => ({ resolveTmdbIdFromTvdbId: async () => 95396 }));

import { handleArrWebhookEvent } from "./webhook";

function event(body: unknown) {
  return new Request("http://marquee.test/api/webhooks/servers/x", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => vi.clearAllMocks());

describe("handleArrWebhookEvent", () => {
  it("holds a Grab to be confirmed rather than announcing it straight away", async () => {
    const res = await handleArrWebhookEvent(event({ eventType: "Grab", movie: { title: "Dune", tmdbId: 438631 } }), {
      ownerId: "admin",
      kind: "radarr",
      fourK: false,
    });
    expect(res.status).toBe(200);
    expect(effects.holdGrabNotice).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "admin", kind: "radarr", mediaType: "movie", tmdbId: 438631, title: "Dune" }),
    );
    expect(effects.createNotification).not.toHaveBeenCalled();
    expect(effects.scheduleCompletionCheck).not.toHaveBeenCalled();
  });

  it("hands the hold the episodes, the download id and the server the webhook came from", async () => {
    const server = { id: "srv", name: "Sonarr" } as never;
    const episodes = [{ seasonNumber: 2, episodeNumber: 5, airDateUtc: "2026-11-19T02:00:00Z" }];
    await handleArrWebhookEvent(
      event({
        eventType: "Grab",
        series: { title: "Severance", tvdbId: 371980 },
        episodes,
        release: { releaseTitle: "Severance.S02E05.1080p.WEB" },
        downloadClient: "qBittorrent",
        downloadId: "ABC123",
      }),
      { ownerId: "admin", kind: "sonarr", fourK: false, server },
    );
    expect(effects.holdGrabNotice).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: "tv", tmdbId: 95396, episodes, downloadId: "ABC123", server }),
    );
  });

  it("tells nobody about a downloaded episode, and checks the title's requests instead", async () => {
    const res = await handleArrWebhookEvent(event({ eventType: "Download", series: { title: "Severance", tvdbId: 371980 } }), {
      ownerId: "admin",
      kind: "sonarr",
      fourK: true,
    });
    expect(res.status).toBe(200);
    expect(effects.createNotification).not.toHaveBeenCalled();
    expect(effects.scheduleCompletionCheck).toHaveBeenCalledWith({ mediaType: "tv", tmdbId: 95396, is4k: true });
    expect(effects.clearNotFoundForTitle).toHaveBeenCalledWith("tv", 95396, true);
  });
});
