import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail } from "@/lib/core-result";

// POST /titles/{type}/{id}/share, GET /users/shareable and the shared-title
// fields of GET /notifications, through withApi and the real bearer-token
// checks, with lib/sharing's database work stubbed (its rules are tested in
// lib/sharing).

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));

const SUSAN_ID = "11111111-1111-4111-8111-111111111111";
const KID_ID = "33333333-3333-4333-8333-333333333333";
const SUSAN = "mqt_" + "s".repeat(43);

vi.mock("@/lib/api/token-store", () => ({
  authenticateApiToken: async (token: string) =>
    token === SUSAN
      ? {
          tokenId: "t",
          tokenName: "test",
          expiresAt: new Date("2030-01-01"),
          user: {
            id: SUSAN_ID,
            username: "susan",
            displayName: "Susan",
            role: "member",
            autoApproveMovies: false,
            autoApproveTv: false,
            avatarUpdatedAt: null,
            createdAt: new Date("2026-09-01"),
          },
        }
      : null,
}));
vi.mock("@/lib/integrations/library-owner", () => ({ getLibraryOwnerUserId: async () => SUSAN_ID }));

const sharing = vi.hoisted(() => ({
  shareTitle: vi.fn(),
  listShareableUsers: vi.fn(),
  getPublicBaseUrl: vi.fn(),
  getNotificationSender: vi.fn(),
}));
vi.mock("@/lib/sharing", () => sharing);

const notifications = vi.hoisted(() => ({ getRecentNotifications: vi.fn(), getUnreadCount: vi.fn() }));
vi.mock("@/lib/notifications/query", () => notifications);

import * as shareRoute from "@/app/api/v1/titles/[type]/[id]/share/route";
import * as shareableRoute from "@/app/api/v1/users/shareable/route";
import * as notificationsRoute from "@/app/api/v1/notifications/route";

function call(
  // `never`: each route declares its own params shape.
  handler: (request: Request, context: { params: Promise<never> }) => Promise<Response>,
  {
    method = "GET",
    token = SUSAN,
    body,
    params = {},
  }: { method?: string; token?: string | null; body?: unknown; params?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const request = new Request("http://marquee.local:3000/api/v1/x", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handler(request, { params: Promise.resolve(params) as Promise<never> });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /titles/{type}/{id}/share", () => {
  const params = { type: "movie", id: "425" };

  it("shares as the signed-in account", async () => {
    sharing.shareTitle.mockResolvedValue({ ok: true, sharedWith: 1 });
    const res = await call(shareRoute.POST, { method: "POST", params, body: { userIds: [KID_ID], note: "Watch it" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sharedWith: 1 });
    expect(sharing.shareTitle).toHaveBeenCalledWith(SUSAN_ID, "movie", 425, { userIds: [KID_ID], note: "Watch it" });
  });

  it("needs a sign-in and a real title address", async () => {
    expect((await call(shareRoute.POST, { method: "POST", token: null, params, body: {} })).status).toBe(401);
    expect((await call(shareRoute.POST, { method: "POST", params: { type: "person", id: "1" }, body: {} })).status).toBe(
      404,
    );
    expect((await call(shareRoute.POST, { method: "POST", params: { type: "movie", id: "abc" }, body: {} })).status).toBe(
      404,
    );
    expect(sharing.shareTitle).not.toHaveBeenCalled();
  });

  it("answers each refusal with its status and message", async () => {
    const cases = [
      [fail("invalid", "You can't share with yourself."), 400],
      [fail("not_found", "Someone you picked isn't in this household any more."), 404],
      [fail("rate_limited", "That's a lot of sharing in a short time. Try again in a while."), 429],
    ] as const;
    for (const [failure, status] of cases) {
      sharing.shareTitle.mockResolvedValueOnce(failure);
      const res = await call(shareRoute.POST, { method: "POST", params, body: { userIds: [SUSAN_ID] } });
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ code: failure.code, error: failure.error });
    }
  });
});

describe("GET /users/shareable", () => {
  it("lists names and photos only, with the public address", async () => {
    sharing.listShareableUsers.mockResolvedValue([
      { id: KID_ID, username: "kid", displayName: null, avatarUpdatedAt: new Date(1758220800000) },
    ]);
    sharing.getPublicBaseUrl.mockResolvedValue("https://marquee.example.com");
    const res = await call(shareableRoute.GET);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [
        {
          userId: KID_ID,
          displayName: null,
          username: "kid",
          label: "kid",
          avatarUrl: `/api/v1/users/${KID_ID}/avatar?v=1758220800000`,
        },
      ],
      publicUrl: "https://marquee.example.com",
    });
    expect(sharing.listShareableUsers).toHaveBeenCalledWith(SUSAN_ID);
  });

  it("needs a sign-in", async () => {
    expect((await call(shareableRoute.GET, { token: null })).status).toBe(401);
  });
});

describe("GET /notifications", () => {
  const base = {
    mediaType: "movie" as const,
    tmdbId: 425,
    title: "Ice Age",
    read: false,
    createdAt: new Date("2026-09-26T10:00:00Z"),
    is4k: false,
    requestId: null,
    userId: KID_ID,
  };

  it("names who shared a title, and nothing for other kinds", async () => {
    notifications.getUnreadCount.mockResolvedValue(2);
    notifications.getRecentNotifications.mockResolvedValue([
      {
        ...base,
        id: "a",
        eventType: "title_shared",
        message: "Susan shared “Ice Age” with you: Watch it",
        senderUserId: SUSAN_ID,
        note: "Watch it",
        sender: { id: SUSAN_ID, username: "susan", displayName: "Susan", avatarUpdatedAt: null },
      },
      {
        ...base,
        id: "b",
        eventType: "downloaded",
        message: "“Ice Age” is ready",
        senderUserId: null,
        note: null,
        sender: null,
      },
      {
        // The sender's account was removed since.
        ...base,
        id: "c",
        eventType: "title_shared",
        message: "Gran shared “Ice Age” with you",
        senderUserId: null,
        note: null,
        sender: null,
      },
    ]);
    const body = await (await call(notificationsRoute.GET)).json();
    expect(body.results[0]).toMatchObject({
      eventType: "title_shared",
      sharedBy: { userId: SUSAN_ID, displayName: "Susan", username: "susan", label: "Susan", avatarUrl: null },
      note: "Watch it",
    });
    expect(body.results[1]).toMatchObject({ eventType: "downloaded", sharedBy: null, note: null });
    expect(body.results[2]).toMatchObject({ eventType: "title_shared", sharedBy: null, note: null });
  });
});
