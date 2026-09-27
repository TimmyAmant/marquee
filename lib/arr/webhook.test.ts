import { beforeEach, describe, expect, it, vi } from "vitest";

// What a Sonarr/Radarr event does once its secret checked out: a Grab tells
// the admin it started downloading; a Download tells nobody about the file
// itself, only schedules the "ready to watch" check for the title.

vi.mock("server-only", () => ({}));
const effects = vi.hoisted(() => ({
  createNotification: vi.fn(async (_input: Record<string, unknown>) => true),
  scheduleCompletionCheck: vi.fn(),
  clearNotFoundForTitle: vi.fn(async () => undefined),
  syncArrLibrary: vi.fn(async () => ({ count: 0 })),
}));
vi.mock("@/lib/notifications/query", () => ({ createNotification: effects.createNotification }));
vi.mock("@/lib/requests/complete", () => ({ scheduleCompletionCheck: effects.scheduleCompletionCheck }));
vi.mock("@/lib/requests/not-found", () => ({ clearNotFoundForTitle: effects.clearNotFoundForTitle }));
vi.mock("@/lib/arr/sync", () => ({ syncArrLibrary: effects.syncArrLibrary }));
vi.mock("@/lib/tmdb/cross-reference", () => ({ resolveTmdbIdFromTvdbId: async () => 95396 }));

import { handleArrWebhookEvent } from "./webhook";

function event(body: unknown) {
  return new Request("http://marquee.test/api/webhooks/servers/x", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => vi.clearAllMocks());

describe("handleArrWebhookEvent", () => {
  it("tells the admin a Grab started downloading", async () => {
    const res = await handleArrWebhookEvent(event({ eventType: "Grab", movie: { title: "Dune", tmdbId: 438631 } }), {
      ownerId: "admin",
      kind: "radarr",
      fourK: false,
    });
    expect(res.status).toBe(200);
    expect(effects.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "admin", eventType: "grabbed", tmdbId: 438631 }),
    );
    expect(effects.scheduleCompletionCheck).not.toHaveBeenCalled();
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
