import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// Confirming a personal channel with its code, against a real Postgres
// (PGlite, lib/test/pglite.ts): the five-wrong-codes cap holds however many
// guesses arrive at once.

vi.mock("server-only", () => ({}));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({}) } }));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { userNotificationChannels, users } from "@/lib/db/schema";
import { presetPermissions } from "@/lib/users/permissions";
import { verifyChannel } from "@/lib/notifications/personal";

async function db() {
  return (await testDatabase()).db;
}

const RIGHT = "123456";
let anna: string;
let channel: string;

beforeEach(async () => {
  await resetTestDatabase();
  const [user] = await (await db())
    .insert(users)
    .values({ username: "anna", role: "member", permissions: presetPermissions("member") })
    .returning({ id: users.id });
  anna = user.id;
  const [row] = await (await db())
    .insert(userNotificationChannels)
    .values({
      userId: anna,
      kind: "email",
      target: "a•••@example.com",
      configEnc: Buffer.from("x"),
      configIv: Buffer.from("x"),
      configTag: Buffer.from("x"),
      verified: false,
      verifyExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
    .returning({ id: userNotificationChannels.id });
  channel = row.id;
  await (await db())
    .update(userNotificationChannels)
    .set({ verifyCodeHash: createHash("sha256").update(`${channel}:${RIGHT}`).digest("hex") })
    .where(eq(userNotificationChannels.id, channel));
});

describe("verifyChannel", () => {
  it("accepts the right code and resets the count", async () => {
    expect(await verifyChannel(anna, channel, "000000")).toMatchObject({ ok: false, code: "invalid" });
    expect(await verifyChannel(anna, channel, RIGHT)).toMatchObject({ ok: true });
    const [row] = await (await db()).select().from(userNotificationChannels).where(eq(userNotificationChannels.id, channel));
    expect(row).toMatchObject({ verified: true, verifyAttempts: 0, verifyCodeHash: null });
  });

  it("checks only five guesses however many arrive at once", async () => {
    const guesses = Array.from({ length: 30 }, (_, i) => verifyChannel(anna, channel, String(100000 + i)));
    const results = await Promise.all(guesses);
    expect(results.filter((r) => !r.ok && r.code === "invalid")).toHaveLength(5);
    expect(results.filter((r) => !r.ok && r.code === "rate_limited")).toHaveLength(25);

    // Out of guesses: even the right code is refused now.
    expect(await verifyChannel(anna, channel, RIGHT)).toMatchObject({ ok: false, code: "rate_limited" });
    const [row] = await (await db()).select().from(userNotificationChannels).where(eq(userNotificationChannels.id, channel));
    expect(row).toMatchObject({ verified: false, verifyAttempts: 5 });
  });
});
