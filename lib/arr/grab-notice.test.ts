import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "Started downloading" only for grabs that really are downloading: a fake
// release of an unaired episode, failed and deleted by Sonarr, used to be
// announced all the same.

vi.mock("server-only", () => ({}));
const fake = vi.hoisted(() => ({
  createNotification: vi.fn(async (_input: Record<string, unknown>) => true),
  getDefaultArrServer: vi.fn(async () => ({ id: "default", baseUrl: "http://sonarr:8989", apiKey: "k" })),
  queue: vi.fn(async (): Promise<Set<string> | null> => new Set<string>()),
  history: vi.fn(async (): Promise<string[] | null> => []),
}));
vi.mock("@/lib/notifications/query", () => ({ createNotification: fake.createNotification }));
vi.mock("@/lib/arr/servers", () => ({
  getDefaultArrServer: fake.getDefaultArrServer,
  arrConfig: (server: { baseUrl: string; apiKey: string }) => ({ baseUrl: server.baseUrl, apiKey: server.apiKey }),
}));
// Sonarr and Radarr answer alike here; null stands for "couldn't be reached".
const client = vi.hoisted(() => ({
  getQueueDownloadIds: async () => {
    const ids = await fake.queue();
    if (!ids) throw new Error("unreachable");
    return ids;
  },
  getDownloadHistory: async () => {
    const events = await fake.history();
    if (!events) throw new Error("unreachable");
    return events;
  },
}));
vi.mock("@/lib/sonarr/client", () => client);
vi.mock("@/lib/radarr/client", () => client);

import {
  airsLater,
  announceIfConfirmed,
  EARLY_GRAB_HOLD_MS,
  episodesLabel,
  GRAB_HOLD_MS,
  grabVerdict,
  holdGrabNotice,
  type HeldGrab,
} from "./grab-notice";

const NOW = Date.parse("2026-11-17T20:00:00Z");
const ep = (season: number, episode: number, airDateUtc?: string) => ({ seasonNumber: season, episodeNumber: episode, airDateUtc });

beforeEach(() => {
  vi.clearAllMocks();
  fake.queue.mockResolvedValue(new Set());
  fake.history.mockResolvedValue([]);
});

describe("episodesLabel", () => {
  it("names one episode, a run within a season, a few, or many", () => {
    expect(episodesLabel([ep(2, 5)])).toBe("S02E05");
    expect(episodesLabel([ep(2, 7), ep(2, 5), ep(2, 6)])).toBe("S02E05-E07");
    expect(episodesLabel([ep(3, 1), ep(2, 5)])).toBe("S02E05, S03E01");
    expect(episodesLabel([ep(1, 1), ep(1, 3), ep(1, 5), ep(1, 7), ep(1, 9)])).toBe("S01E01 +4");
  });

  it("names nothing for a movie or a payload without episode numbers", () => {
    expect(episodesLabel([])).toBeNull();
    expect(episodesLabel([{ airDateUtc: "2026-11-18T02:00:00Z" }])).toBeNull();
  });

  it("counts an episode grabbed twice once", () => {
    expect(episodesLabel([ep(2, 5), ep(2, 5)])).toBe("S02E05");
  });
});

describe("airsLater", () => {
  it("is the air time when nothing in the grab has aired yet", () => {
    // Grabbed the evening before a 9pm (Eastern) premiere.
    expect(airsLater([ep(2, 5, "2026-11-19T02:00:00Z")], NOW)).toEqual(new Date("2026-11-19T02:00:00Z"));
  });

  it("is null once any episode has aired, or is about to", () => {
    expect(airsLater([ep(2, 4, "2026-11-10T02:00:00Z"), ep(2, 5, "2026-11-19T02:00:00Z")], NOW)).toBeNull();
    expect(airsLater([ep(2, 5, "2026-11-17T21:00:00Z")], NOW)).toBeNull();
  });

  it("is null when an air time is unknown, or for a movie", () => {
    expect(airsLater([ep(2, 5)], NOW)).toBeNull();
    expect(airsLater([], NOW)).toBeNull();
  });
});

describe("grabVerdict", () => {
  it("announces a download still in the queue, or one that already finished and imported", () => {
    expect(grabVerdict({ reachable: true, inQueue: true, history: ["grabbed"] })).toBe("announce");
    expect(grabVerdict({ reachable: true, inQueue: false, history: ["downloadFolderImported", "grabbed"] })).toBe(
      "announce",
    );
  });

  it("drops one that failed or was ignored, even if the queue hasn't caught up", () => {
    expect(grabVerdict({ reachable: true, inQueue: true, history: ["downloadFailed", "grabbed"] })).toBe("drop");
    expect(grabVerdict({ reachable: true, inQueue: false, history: ["downloadIgnored", "grabbed"] })).toBe("drop");
  });

  it("drops one that vanished without arriving", () => {
    expect(grabVerdict({ reachable: true, inQueue: false, history: ["grabbed"] })).toBe("drop");
  });

  it("gives a server that can't be asked the benefit of the doubt", () => {
    expect(grabVerdict({ reachable: false })).toBe("announce");
  });
});

function held(downloads: [string, ReturnType<typeof ep>[]][], extra: Partial<HeldGrab> = {}): HeldGrab {
  return {
    ownerId: "admin",
    kind: "sonarr",
    fourK: false,
    server: null,
    mediaType: "tv",
    tmdbId: 95396,
    title: "Severance",
    downloads: new Map(downloads),
    ...extra,
  };
}

/** The English message createNotification was handed. */
function messageOf(call: Record<string, unknown>): string {
  const t = (key: string, values?: Record<string, string>) => `${key}${values ? JSON.stringify(values) : ""}`;
  return (call.message as (t: unknown) => string)(t);
}

describe("announceIfConfirmed", () => {
  it("doesn't announce a fake that Sonarr failed and removed", async () => {
    fake.history.mockResolvedValue(["downloadFailed", "grabbed"]);
    const told = await announceIfConfirmed(held([["ABC", [ep(2, 5, "2026-11-19T02:00:00Z")]]]), NOW);
    expect(told).toBe(false);
    expect(fake.createNotification).not.toHaveBeenCalled();
  });

  it("names the episode once the download is confirmed in the queue", async () => {
    fake.queue.mockResolvedValue(new Set(["ABC"]));
    expect(await announceIfConfirmed(held([["abc", [ep(2, 5, "2026-11-10T02:00:00Z")]]]), NOW)).toBe(true);
    const call = fake.createNotification.mock.calls[0][0];
    expect(call).toMatchObject({ userId: "admin", eventType: "grabbed", tmdbId: 95396, is4k: false });
    expect(messageOf(call)).toBe('notify.startedDownloadingEpisodes{"title":"Severance","episodes":"S02E05"}');
  });

  it("says when a confirmed download is for an episode that hasn't aired", async () => {
    fake.queue.mockResolvedValue(new Set(["ABC"]));
    await announceIfConfirmed(held([["ABC", [ep(2, 5, "2026-11-19T02:00:00Z")]]]), NOW);
    expect(messageOf(fake.createNotification.mock.calls[0][0])).toContain("notify.startedDownloadingEarly");
  });

  it("names only the episodes whose downloads are confirmed", async () => {
    fake.queue.mockResolvedValue(new Set(["GOOD"]));
    await announceIfConfirmed(held([["GOOD", [ep(2, 4)]], ["GONE", [ep(2, 5)]]]), NOW);
    expect(messageOf(fake.createNotification.mock.calls[0][0])).toContain('"episodes":"S02E04"');
  });

  it("announces as before when there's no download id to look up", async () => {
    await announceIfConfirmed(held([["", [ep(2, 5)]]]), NOW);
    expect(fake.createNotification).toHaveBeenCalledTimes(1);
  });

  it("announces when the server can't be reached to confirm", async () => {
    fake.queue.mockResolvedValue(null);
    await announceIfConfirmed(held([["ABC", [ep(2, 5)]]]), NOW);
    expect(fake.createNotification).toHaveBeenCalledTimes(1);
  });

  it("looks a legacy webhook's grab up on the default server of its kind", async () => {
    fake.queue.mockResolvedValue(new Set(["ABC"]));
    await announceIfConfirmed(held([["ABC", [ep(2, 5)]]], { fourK: true }), NOW);
    expect(fake.getDefaultArrServer).toHaveBeenCalledWith("admin", "sonarr", true);
  });

  it("keeps a movie's message as it was", async () => {
    fake.queue.mockResolvedValue(new Set(["ABC"]));
    await announceIfConfirmed(held([["ABC", []]], { kind: "radarr", mediaType: "movie", title: "Dune" }), NOW);
    expect(messageOf(fake.createNotification.mock.calls[0][0])).toBe('notify.startedDownloading{"title":"Dune"}');
  });
});

describe("holdGrabNotice", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const grab = (episodes: ReturnType<typeof ep>[], downloadId: string | null, tmdbId = 95396) => ({
    ownerId: "admin",
    kind: "sonarr" as const,
    fourK: false,
    server: null,
    mediaType: "tv" as const,
    tmdbId,
    title: "Severance",
    episodes,
    downloadId,
  });

  it("checks after the hold, gathering the grabs of the same title into one notice", async () => {
    fake.queue.mockResolvedValue(new Set(["A", "B"]));
    holdGrabNotice(grab([ep(2, 5)], "A", 1), NOW);
    holdGrabNotice(grab([ep(2, 6)], "B", 1), NOW);
    await vi.advanceTimersByTimeAsync(GRAB_HOLD_MS - 1000);
    expect(fake.createNotification).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.createNotification).toHaveBeenCalledTimes(1);
    expect(messageOf(fake.createNotification.mock.calls[0][0])).toContain('"episodes":"S02E05-E06"');
  });

  it("waits longer before checking a grab of an episode that hasn't aired", async () => {
    fake.queue.mockResolvedValue(new Set(["A"]));
    holdGrabNotice(grab([ep(2, 5, new Date(Date.now() + 24 * 3_600_000).toISOString())], "A", 2));
    await vi.advanceTimersByTimeAsync(GRAB_HOLD_MS + 1000);
    expect(fake.createNotification).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(EARLY_GRAB_HOLD_MS);
    expect(fake.createNotification).toHaveBeenCalledTimes(1);
  });
});

describe("holdGrabNotice, joining a hold", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits the longer time when an unaired episode joins a title already waiting", async () => {
    fake.queue.mockResolvedValue(new Set(["A", "B"]));
    const base = { ownerId: "admin", kind: "sonarr" as const, fourK: false, server: null, mediaType: "tv" as const, tmdbId: 3, title: "Severance" };
    holdGrabNotice({ ...base, episodes: [ep(2, 4)], downloadId: "A" });
    holdGrabNotice({ ...base, episodes: [ep(2, 5, new Date(Date.now() + 24 * 3_600_000).toISOString())], downloadId: "B" });
    await vi.advanceTimersByTimeAsync(GRAB_HOLD_MS + 1000);
    expect(fake.createNotification).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(EARLY_GRAB_HOLD_MS);
    expect(fake.createNotification).toHaveBeenCalledTimes(1);
    expect(messageOf(fake.createNotification.mock.calls[0][0])).toContain('"episodes":"S02E04-E05"');
  });
});
