import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// Comment threads on requests and problem reports, against a real Postgres
// (PGlite): who may see and write, the notes a thread starts with, the edit
// window, who's notified — and the /api/v1 routes around them (plus the
// request lifecycle ones), called the way an app calls them.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
vi.mock("@/lib/cache/revalidate", () => ({ revalidatePathSafely: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/notifications/fan-out", () => ({ fanOut: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/bus", () => ({ publishNotification: () => undefined }));
vi.mock("@/lib/push/deliver", () => ({ pushToUser: vi.fn(async () => 0), pushMessageFor: () => ({}) }));
vi.mock("@/lib/arr/title-actions", () => ({
  addMovieToRadarrForUser: vi.fn(async () => ({ ok: false, code: "upstream", error: "Couldn't add this movie to Radarr." })),
  addSeriesToSonarrForUser: vi.fn(async () => ({ ok: false, code: "upstream", error: "Couldn't add this series to Sonarr." })),
}));
vi.mock("@/lib/integrations/library-owner", () => ({ getLibraryOwnerUserId: async () => ids.admin }));

const ids = vi.hoisted(() => ({ admin: "", trusted: "", anna: "", ben: "" }));
const tokens = vi.hoisted(() => new Map<string, () => { id: string; role: string }>());
vi.mock("@/lib/api/token-store", () => ({
  authenticateApiToken: async (token: string) => {
    const who = tokens.get(token)?.();
    if (!who) return null;
    return {
      tokenId: "t",
      tokenName: "test",
      expiresAt: new Date("2030-01-01"),
      user: { id: who.id, username: who.role, displayName: null, role: who.role, avatarUpdatedAt: null, createdAt: new Date() },
    };
  },
}));

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { comments, issues, notifications, requests, users } from "@/lib/db/schema";
import { addComment, commentRecipients, deleteComment, editComment, listComments } from "@/lib/comments";
import { fanOut } from "@/lib/notifications/fan-out";
import * as requestRoute from "@/app/api/v1/requests/[id]/route";
import * as requestComments from "@/app/api/v1/requests/[id]/comments/route";
import * as requestComment from "@/app/api/v1/requests/[id]/comments/[commentId]/route";
import * as issueComments from "@/app/api/v1/issues/[id]/comments/route";
import * as retryRoute from "@/app/api/v1/requests/[id]/retry/route";
import * as approveRoute from "@/app/api/v1/requests/[id]/approve/route";
import * as historyRoute from "@/app/api/v1/requests/history/route";
import * as mineRoute from "@/app/api/v1/requests/mine/route";

const TOKEN = { admin: "mqt_" + "a".repeat(43), trusted: "mqt_" + "t".repeat(43), anna: "mqt_" + "n".repeat(43), ben: "mqt_" + "b".repeat(43) };
tokens.set(TOKEN.admin, () => ({ id: ids.admin, role: "admin" }));
tokens.set(TOKEN.trusted, () => ({ id: ids.trusted, role: "trusted" }));
tokens.set(TOKEN.anna, () => ({ id: ids.anna, role: "member" }));
tokens.set(TOKEN.ben, () => ({ id: ids.ben, role: "member" }));

async function db() {
  return (await testDatabase()).db;
}

async function addUser(username: string, role: "admin" | "trusted" | "member") {
  const [row] = await (await db()).insert(users).values({ username, role }).returning({ id: users.id });
  return row.id;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each route types its own params
type Handler = (request: Request, context: { params: Promise<any> }) => Promise<Response>;
async function call(handler: Handler, token: string, params: Record<string, string>, method = "GET", body?: unknown) {
  const response = await handler(
    new Request("http://marquee.test/api/v1/x", {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve(params) },
  );
  return { status: response.status, body: await response.json() };
}

let request: typeof requests.$inferSelect;
let issue: typeof issues.$inferSelect;

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
  ids.admin = await addUser("admin", "admin");
  ids.trusted = await addUser("tess", "trusted");
  ids.anna = await addUser("anna", "member");
  ids.ben = await addUser("ben", "member");
  [request] = await (await db())
    .insert(requests)
    .values({ requestedByUserId: ids.anna, mediaType: "movie", tmdbId: 438631, title: "Dune" })
    .returning();
  [issue] = await (await db())
    .insert(issues)
    .values({ reportedByUserId: ids.anna, mediaType: "movie", tmdbId: 603, title: "The Matrix", kind: "audio", message: "Out of sync" })
    .returning();
});

const as = (who: keyof typeof ids) => ({ userId: ids[who], role: who === "anna" || who === "ben" ? "member" : who });

describe("who takes part", () => {
  it("is the requester and the reviewers; anyone else gets not found", async () => {
    const target = { kind: "request" as const, id: request.id };
    expect(await addComment(as("anna"), target, "Could it be the 4K one?")).toMatchObject({ ok: true });
    expect(await addComment(as("trusted"), target, "Sure")).toMatchObject({ ok: true });
    expect(await addComment(as("ben"), target, "Me too")).toMatchObject({ ok: false, code: "not_found" });
    expect(await listComments(as("ben"), target)).toMatchObject({ ok: false, code: "not_found" });
    const seen = await listComments(as("admin"), target);
    expect(seen.ok && seen.thread.results.map((c) => [c.author.label, c.body, c.author.role])).toEqual([
      ["anna", "Could it be the 4K one?", "member"],
      ["tess", "Sure", "reviewer"],
    ]);
    // A made-up id reads the same as someone else's.
    expect(await listComments(as("ben"), { kind: "request", id: "not-a-uuid" })).toMatchObject({ code: "not_found" });
  });

  it("starts a report's thread with its note, and the fix note once it's fixed", async () => {
    await (await db())
      .update(issues)
      .set({ status: "resolved", resolution: "Replaced the file", resolvedByUserId: ids.admin, resolvedAt: new Date(Date.now() + 1000) })
      .where(eq(issues.id, issue.id));
    await addComment(as("anna"), { kind: "issue", id: issue.id }, "Thanks!");
    const thread = await listComments(as("anna"), { kind: "issue", id: issue.id });
    expect(thread.ok && thread.thread.results.map((c) => [c.kind, c.author.label, c.body, c.canEdit])).toEqual([
      ["report", "anna", "Out of sync", false],
      ["comment", "anna", "Thanks!", true],
      ["resolution", "admin", "Replaced the file", false],
    ]);
    expect(await listComments(as("ben"), { kind: "issue", id: issue.id })).toMatchObject({ code: "not_found" });
  });

  it("goes with its request", async () => {
    await addComment(as("anna"), { kind: "request", id: request.id }, "Hello");
    await (await db()).delete(requests).where(eq(requests.id, request.id));
    expect(await (await db()).select().from(comments)).toEqual([]);
  });
});

describe("notifications", () => {
  it("go to every reviewer when the requester writes first, and never to the household channels", async () => {
    await addComment(as("anna"), { kind: "request", id: request.id }, "Any news?");
    const sent = await (await db()).select().from(notifications).where(eq(notifications.eventType, "request_comment"));
    expect(sent.map((n) => n.userId).sort()).toEqual([ids.admin, ids.trusted].sort());
    expect(sent[0]).toMatchObject({ requestId: request.id, message: `anna commented on "Dune": Any news?` });
    expect(vi.mocked(fanOut).mock.calls.every(([, relay]) => relay === false)).toBe(true);
  });

  it("then only to the requester and the reviewers taking part", async () => {
    await addComment(as("trusted"), { kind: "request", id: request.id }, "Looking into it");
    await addComment(as("anna"), { kind: "request", id: request.id }, "Thanks");
    const sent = await (await db()).select().from(notifications).where(eq(notifications.eventType, "request_comment"));
    // Tess's comment → Anna; Anna's reply → Tess only (the admin isn't in it).
    expect(sent.map((n) => n.userId)).toEqual([ids.anna, ids.trusted]);
  });

  it("follow the account's own choices", async () => {
    await (await db()).insert((await import("@/lib/db/schema")).notificationPreferences).values({
      userId: ids.anna,
      overrides: { request_comment: { inApp: false, push: false } },
    });
    await addComment(as("admin"), { kind: "issue", id: issue.id }, "Which episode?");
    const [sent] = await (await db()).select().from(notifications).where(eq(notifications.userId, ids.anna));
    expect(sent).toMatchObject({ eventType: "issue_comment", issueId: issue.id, inBell: false, alert: false });
  });

  it("pick recipients by who's involved", () => {
    expect(commentRecipients({ authorId: "a", ownerId: "a", involvedIds: [], reviewerIds: ["r1", "r2"] })).toEqual(["r1", "r2"]);
    expect(commentRecipients({ authorId: "r1", ownerId: "a", involvedIds: ["r1"], reviewerIds: ["r1", "r2"] })).toEqual(["a"]);
    expect(commentRecipients({ authorId: "a", ownerId: "a", involvedIds: ["r2", "x"], reviewerIds: ["r1", "r2"] })).toEqual(["r2"]);
    // A reviewer who's since become a member doesn't hear any more.
    expect(commentRecipients({ authorId: "a", ownerId: "a", involvedIds: ["gone"], reviewerIds: ["r1"] })).toEqual(["r1"]);
  });
});

describe("changing a comment", () => {
  it("is its author's, for a short while; the admin may delete any", async () => {
    const target = { kind: "request" as const, id: request.id };
    const posted = await addComment(as("anna"), target, "Frist");
    if (!posted.ok) throw new Error("not posted");
    expect(await editComment(as("anna"), target, posted.commentId, "First")).toEqual({ ok: true });
    expect(await editComment(as("trusted"), target, posted.commentId, "Hacked")).toMatchObject({ code: "forbidden" });
    const later = new Date(Date.now() + 16 * 60 * 1000);
    expect(await editComment(as("anna"), target, posted.commentId, "Late", later)).toMatchObject({ code: "forbidden" });
    expect(await deleteComment(as("anna"), target, posted.commentId, later)).toMatchObject({ code: "forbidden" });
    // Addressed through the wrong thread, it isn't found.
    expect(await deleteComment(as("admin"), { kind: "issue", id: issue.id }, posted.commentId)).toMatchObject({ code: "not_found" });
    expect(await deleteComment(as("admin"), target, posted.commentId, later)).toEqual({ ok: true });
    const [row] = await (await db()).select().from(comments);
    expect(row).toBeUndefined();
  });

  it("is rate limited", async () => {
    const target = { kind: "request" as const, id: request.id };
    const results = [];
    for (let i = 0; i < 14; i++) results.push(await addComment(as("ben"), { kind: "request", id: request.id }, `x${i}`));
    // Ben isn't in this thread at all: not found, and nothing counted.
    expect(results.every((r) => !r.ok && r.code === "not_found")).toBe(true);
    const mine = [];
    for (let i = 0; i < 14; i++) mine.push(await addComment(as("anna"), target, `note ${i}`));
    expect(mine.filter((r) => r.ok).length).toBe(12);
    expect(mine.at(-1)).toMatchObject({ code: "rate_limited" });
  });
});

describe("the API", () => {
  it("serves threads only to the people in them", async () => {
    const posted = await call(requestComments.POST, TOKEN.anna, { id: request.id }, "POST", { body: "Hi" });
    expect(posted).toMatchObject({ status: 200, body: { ok: true } });
    expect((await call(requestComments.GET, TOKEN.ben, { id: request.id })).status).toBe(404);
    const thread = await call(requestComments.GET, TOKEN.trusted, { id: request.id });
    expect(thread.body).toMatchObject({ canComment: true, maxLength: 2000, results: [{ body: "Hi", isMine: false, canEdit: false }] });
    expect((await call(requestComments.POST, TOKEN.anna, { id: request.id }, "POST", { body: " " })).status).toBe(400);
    const edited = await call(requestComment.PATCH, TOKEN.anna, { id: request.id, commentId: posted.body.commentId }, "PATCH", { body: "Hi!" });
    expect(edited.status).toBe(200);
    expect((await call(requestComment.DELETE, TOKEN.ben, { id: request.id, commentId: posted.body.commentId }, "DELETE")).status).toBe(404);
    expect((await call(issueComments.GET, TOKEN.ben, { id: issue.id })).status).toBe(404);
    expect((await call(issueComments.GET, TOKEN.anna, { id: issue.id })).body.results[0]).toMatchObject({ kind: "report", body: "Out of sync" });
  });

  it("edits and cancels your own pending request, never someone else's", async () => {
    expect((await call(requestRoute.PATCH, TOKEN.ben, { id: request.id }, "PATCH", { is4k: false })).status).toBe(404);
    expect((await call(requestRoute.PATCH, TOKEN.anna, { id: request.id }, "PATCH", { is4k: "yes" })).status).toBe(400);
    expect((await call(requestRoute.DELETE, TOKEN.ben, { id: request.id }, "DELETE")).status).toBe(404);
    expect((await call(requestRoute.DELETE, TOKEN.admin, { id: request.id }, "DELETE")).status).toBe(403);
    const mine = await call(mineRoute.GET, TOKEN.anna, {});
    expect(mine.body.results[0]).toMatchObject({ id: request.id, canEdit: true, canCancel: true, commentCount: 0, editedAt: null });
    expect(await call(requestRoute.DELETE, TOKEN.anna, { id: request.id }, "DELETE")).toEqual({ status: 200, body: { ok: true } });
    expect((await call(requestRoute.DELETE, TOKEN.anna, { id: request.id }, "DELETE")).status).toBe(404);
  });

  it("marks a failed approval, lists it, and only reviewers may retry", async () => {
    const approved = await call(approveRoute.POST, TOKEN.admin, { id: request.id }, "POST");
    expect(approved.status).toBe(502);
    expect(approved.body.error).toContain("Couldn't add");
    const history = await call(historyRoute.GET, TOKEN.trusted, {});
    expect(history.body.results[0]).toMatchObject({
      id: request.id,
      status: "approved",
      addedTo: null,
      addFailed: { error: "Couldn't add this movie to Radarr." },
      commentCount: 0,
    });
    expect((await call(retryRoute.POST, TOKEN.anna, { id: request.id }, "POST")).status).toBe(403);
    expect((await call(retryRoute.POST, TOKEN.trusted, { id: request.id }, "POST", { tags: "x" })).status).toBe(400);
    expect((await call(retryRoute.POST, TOKEN.trusted, { id: request.id }, "POST")).status).toBe(502);
  });
});
