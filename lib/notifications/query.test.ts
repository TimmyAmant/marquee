import { beforeEach, describe, expect, it, vi } from "vitest";

// createNotification: the account's bell and device-push choices decide
// what's listed, streamed and pushed; channels are handed to fanOut.

const inserted = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("@/lib/db/client", () => ({
  db: {
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        returning: async () => {
          const saved = { id: `n${inserted.length + 1}`, read: false, is4k: false, createdAt: new Date(), requestId: null, ...row };
          inserted.push(saved);
          return [saved];
        },
      }),
    }),
  },
}));
const overrides = vi.hoisted(() => ({ value: {} as Record<string, { inApp?: boolean; push?: boolean }> }));
vi.mock("@/lib/notifications/preferences", () => ({ loadBellPushOverrides: async () => overrides.value }));
const effects = vi.hoisted(() => ({
  published: [] as string[],
  pushed: [] as string[],
  fanOut: vi.fn(async (_input: unknown, _relay: boolean) => undefined),
}));
vi.mock("@/lib/notifications/bus", () => ({ publishNotification: (row: { id: string }) => effects.published.push(row.id) }));
vi.mock("@/lib/push/deliver", () => ({
  pushMessageFor: (row: { id: string }) => ({ tag: row.id }),
  pushToUser: async (_userId: string, message: { tag: string }) => void effects.pushed.push(message.tag),
}));
vi.mock("@/lib/notifications/fan-out", () => ({ fanOut: effects.fanOut }));

import { createNotification } from "./query";

const base = {
  userId: "anna",
  mediaType: "movie" as const,
  tmdbId: 438631,
  title: "Dune",
  eventType: "request_approved" as const,
  message: "“Dune” was approved",
};

beforeEach(() => {
  inserted.length = 0;
  overrides.value = {};
  effects.published = [];
  effects.pushed = [];
  effects.fanOut.mockClear();
});

describe("createNotification", () => {
  it("does what it always did for an account that chose nothing", async () => {
    await createNotification(base);
    expect(inserted[0]).toMatchObject({ inBell: true, alert: true });
    expect(effects.published).toEqual(["n1"]);
    expect(effects.pushed).toEqual(["n1"]);
    expect(effects.fanOut).toHaveBeenCalledWith(expect.objectContaining({ userId: "anna", event: "request_approved" }), true);
  });

  it("keeps it out of device push when push is off", async () => {
    overrides.value = { request_approved: { push: false } };
    await createNotification(base);
    expect(inserted[0]).toMatchObject({ inBell: true, alert: false });
    expect(effects.published).toEqual(["n1"]);
    expect(effects.pushed).toEqual([]);
  });

  it("still saves it (for repeats) but neither lists nor pushes it when both are off", async () => {
    overrides.value = { request_approved: { inApp: false, push: false } };
    await createNotification(base);
    expect(inserted[0]).toMatchObject({ inBell: false, alert: false, read: true });
    expect(effects.published).toEqual([]);
    expect(effects.pushed).toEqual([]);
    // Personal channels are their own choice.
    expect(effects.fanOut).toHaveBeenCalled();
  });

  it("files a watchlist batch under its own event, and passes relay on", async () => {
    overrides.value = { watchlist_requests: { push: false } };
    await createNotification({ ...base, eventType: "request_created", topic: "watchlist_requests", relay: false });
    expect(inserted[0]).toMatchObject({ alert: false });
    expect(inserted[0]).not.toHaveProperty("topic");
    expect(effects.fanOut).toHaveBeenCalledWith(expect.objectContaining({ event: "watchlist_requests" }), false);
  });
});
