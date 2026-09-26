import { beforeEach, describe, expect, it, vi } from "vitest";

// shareTitle with the database, TMDb and the notification sender stubbed:
// who it may go to, the note, the hourly limit, and what each recipient gets.

const SUSAN = "11111111-1111-4111-8111-111111111111";
const KID = "33333333-3333-4333-8333-333333333333";
const GRAN = "44444444-4444-4444-8444-444444444444";
const STRANGER = "99999999-9999-4999-8999-999999999999";

const accounts = [
  { id: SUSAN, username: "susan", displayName: "Susan", avatarUpdatedAt: null },
  { id: KID, username: "kid", displayName: null, avatarUpdatedAt: null },
  { id: GRAN, username: "gran", displayName: "Gran", avatarUpdatedAt: null },
];

vi.mock("drizzle-orm", async (original) => ({
  ...(await original<typeof import("drizzle-orm")>()),
  eq: (_column: unknown, id: string) => ({ ids: [id] }),
  inArray: (_column: unknown, ids: string[]) => ({ ids }),
}));
vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: ({ ids }: { ids: string[] }) => {
          const rows = accounts.filter((account) => ids.includes(account.id));
          return Object.assign(Promise.resolve(rows), { limit: async () => rows });
        },
      }),
    }),
  },
}));
const createNotification = vi.hoisted(() => vi.fn(async (_input: Record<string, unknown>) => true));
vi.mock("@/lib/notifications/query", () => ({ createNotification }));
const getOrFetchTitle = vi.hoisted(() => vi.fn(async () => ({ name: "Ice Age" }) as { name: string } | null));
vi.mock("@/lib/tmdb/cache", () => ({ getOrFetchTitle }));

import { shareTitle } from "./index";
import { attemptCount } from "@/lib/rate-limit";

// Each test shares as a fresh sender, so the hourly budget starts full.
let sender = SUSAN;
beforeEach(() => {
  createNotification.mockClear();
  getOrFetchTitle.mockClear();
  sender = `11111111-1111-4111-8111-${String(Math.floor(Math.random() * 1e12)).padStart(12, "0")}`;
  accounts[0] = { ...accounts[0], id: sender };
});

describe("shareTitle", () => {
  it("notifies each recipient, personally, with the sender and note", async () => {
    const result = await shareTitle(sender, "movie", 425, { userIds: [KID, GRAN], note: " You'd <i>love</i>\nthis " });
    expect(result).toEqual({ ok: true, sharedWith: 2 });
    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(createNotification).toHaveBeenCalledWith({
      userId: KID,
      mediaType: "movie",
      tmdbId: 425,
      title: "Ice Age",
      eventType: "title_shared",
      message: "Susan shared “Ice Age” with you: You'd love this",
      relay: false,
      senderUserId: sender,
      note: "You'd love this",
    });
  });

  it("goes without a note", async () => {
    await shareTitle(sender, "tv", 1396, { userIds: [KID] });
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Susan shared “Ice Age” with you", note: null }),
    );
  });

  it("only goes to people in the household, never back to the sender", async () => {
    expect(await shareTitle(sender, "movie", 425, { userIds: [KID, STRANGER] })).toEqual({
      ok: false,
      code: "not_found",
      error: "Someone you picked isn't in this household any more.",
    });
    expect(await shareTitle(sender, "movie", 425, { userIds: [sender] })).toMatchObject({
      ok: false,
      code: "invalid",
      error: "You can't share with yourself.",
    });
    expect(await shareTitle(sender, "movie", 425, { userIds: [] })).toMatchObject({ ok: false, code: "invalid" });
    expect(await shareTitle(sender, "movie", 425, { userIds: ["kid"] })).toMatchObject({ ok: false, code: "invalid" });
    expect(createNotification).not.toHaveBeenCalled();
    // Refusals don't cost anything against the limit.
    expect(attemptCount(`share:${sender}`)).toBe(0);
  });

  it("refuses an account that no longer exists as the sender", async () => {
    expect(await shareTitle(STRANGER, "movie", 425, { userIds: [KID] })).toMatchObject({
      ok: false,
      code: "unauthorized",
    });
  });

  it("refuses a note that's too long or not text", async () => {
    expect(await shareTitle(sender, "movie", 425, { userIds: [KID], note: "x".repeat(281) })).toMatchObject({
      ok: false,
      code: "invalid",
      error: "Keep the note under 280 characters.",
    });
    expect(await shareTitle(sender, "movie", 425, { userIds: [KID], note: ["hi"] })).toMatchObject({
      ok: false,
      code: "invalid",
    });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("allows 30 notifications an hour, counting each recipient", async () => {
    for (let i = 0; i < 14; i++) {
      expect(await shareTitle(sender, "movie", 425, { userIds: [KID, GRAN] })).toMatchObject({ ok: true });
    }
    // 28 sent: two more fit, three don't.
    expect(await shareTitle(sender, "movie", 425, { userIds: [KID, GRAN, KID] })).toMatchObject({ ok: true });
    expect(await shareTitle(sender, "movie", 425, { userIds: [KID] })).toEqual({
      ok: false,
      code: "rate_limited",
      error: "That's a lot of sharing in a short time. Try again in a while.",
    });
    expect(createNotification).toHaveBeenCalledTimes(30);
  });

  it("gives the budget back when TMDb can't be reached", async () => {
    getOrFetchTitle.mockResolvedValueOnce(null);
    expect(await shareTitle(sender, "movie", 425, { userIds: [KID, GRAN] })).toMatchObject({
      ok: false,
      code: "upstream",
    });
    expect(attemptCount(`share:${sender}`)).toBe(0);
  });
});
