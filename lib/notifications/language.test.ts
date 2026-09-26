import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// Notifications are written once, when they're made, in the language of
// whoever reads them: each recipient's own (users.language), else the
// household's (the admin's), else English — and the household channels in
// the household's. Against a real Postgres (PGlite).

vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
vi.mock("@/lib/notifications/bus", () => ({ publishNotification: () => undefined }));
const pushed = vi.hoisted(() => [] as { title: string; body: string }[]);
vi.mock("@/lib/push/deliver", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/push/deliver")>()),
  pushToUser: async (_userId: string, message: { title: string; body: string }) => {
    pushed.push(message);
    return 1;
  },
}));
vi.mock("@/lib/notifications/fan-out", () => ({ fanOut: vi.fn(async () => undefined) }));

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { notifications, users } from "@/lib/db/schema";
import { createNotification } from "@/lib/notifications/query";
import { fanOut } from "@/lib/notifications/fan-out";
import { shareTitle } from "@/lib/sharing";

vi.mock("@/lib/tmdb/cache", () => ({ getOrFetchTitle: async () => ({ name: "Ice Age" }) }));

async function db() {
  return (await testDatabase()).db;
}

async function addUser(username: string, role: "admin" | "member", language: string | null = null) {
  const [row] = await (await db()).insert(users).values({ username, role, language }).returning({ id: users.id });
  return row.id;
}

async function messagesOf(userId: string) {
  return (await (await db()).select().from(notifications).where(eq(notifications.userId, userId))).map((n) => n.message);
}

const approved = (userId: string) => ({
  userId,
  mediaType: "movie" as const,
  tmdbId: 438631,
  title: "Dune",
  eventType: "request_approved" as const,
  message: (t: Parameters<Exclude<Parameters<typeof createNotification>[0]["message"], string>>[0]) =>
    t("notify.requestApproved", { request: t("notify.quotedTitle", { title: "Dune" }) }),
});

beforeEach(async () => {
  await resetTestDatabase();
  pushed.length = 0;
  vi.mocked(fanOut).mockClear();
});

describe("a notification's language", () => {
  it("is the recipient's own choice, in the bell and the push", async () => {
    await addUser("admin", "admin");
    const anna = await addUser("anna", "member", "fr");
    await createNotification(approved(anna));
    expect(await messagesOf(anna)).toEqual(["«\u00a0Dune\u00a0» a été approuvé — il arrive dans votre bibliothèque."]);
    expect(pushed[0]).toMatchObject({ title: "Demande approuvée" });
  });

  it("is English for someone who chose nothing in an English household", async () => {
    await addUser("admin", "admin");
    const ben = await addUser("ben", "member");
    await createNotification(approved(ben));
    expect(await messagesOf(ben)).toEqual(['"Dune" was approved — it\'s on its way to your library.']);
  });

  it("follows the household (the admin's language) when the account chose none", async () => {
    await addUser("admin", "admin", "de");
    const ben = await addUser("ben", "member");
    await createNotification(approved(ben));
    expect(await messagesOf(ben)).toEqual(["„Dune“ wurde genehmigt – es ist auf dem Weg in deine Mediathek."]);
  });

  it("gives the household channels the admin's language, whatever the recipient reads", async () => {
    await addUser("admin", "admin", "de");
    const anna = await addUser("anna", "member", "fr");
    await createNotification(approved(anna));
    expect(fanOut).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "«\u00a0Dune\u00a0» a été approuvé — il arrive dans votre bibliothèque.",
        householdMessage: "„Dune“ wurde genehmigt – es ist auf dem Weg in deine Mediathek.",
      }),
      true,
    );
  });

  it("is each recipient's own when one share goes to several people", async () => {
    const admin = await addUser("susan", "admin");
    const anna = await addUser("anna", "member", "fr");
    const ben = await addUser("ben", "member", "es");
    expect(await shareTitle(admin, "movie", 425, { userIds: [anna, ben], note: "Watch it" })).toEqual({ ok: true, sharedWith: 2 });
    expect(await messagesOf(anna)).toEqual(["susan a partagé «\u00a0Ice Age\u00a0» avec vous : Watch it"]);
    expect(await messagesOf(ben)).toEqual(["susan compartió «Ice Age» contigo: Watch it"]);
  });
});
