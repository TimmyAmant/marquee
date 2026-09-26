import { beforeEach, describe, expect, it, vi } from "vitest";

// The save flow with the database, encryption and the three services stubbed.
const store = vi.hoisted(() => new Map<string, string>());
vi.mock("drizzle-orm", () => ({ eq: (_col: unknown, val: string) => val }));
vi.mock("@/lib/db/schema", () => ({ notificationChannels: { kind: "kind" } }));
vi.mock("@/lib/crypto/encryption", () => ({
  encryptSecret: (text: string) => ({ ciphertext: text, iv: "", tag: "" }),
  decryptSecret: (field: { ciphertext: string }) => field.ciphertext,
}));
vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (kind: string) => ({
          limit: async () => (store.has(kind) ? [{ configEnc: store.get(kind), configIv: "", configTag: "" }] : []),
        }),
      }),
    }),
    insert: () => ({
      values: (row: { kind: string; configEnc: string }) => ({
        onConflictDoUpdate: async () => void store.set(row.kind, row.configEnc),
      }),
    }),
    delete: () => ({ where: async (kind: string) => void store.delete(kind) }),
  },
}));
const verify = vi.hoisted(() => ({
  telegram: vi.fn(async (_config: unknown) => ({ ok: true as const })),
  email: vi.fn(async (_config: unknown): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true })),
}));
vi.mock("@/lib/telegram/client", async (original) => ({
  ...(await original<typeof import("@/lib/telegram/client")>()),
  verifyTelegram: verify.telegram,
}));
vi.mock("@/lib/pushover/client", async (original) => ({
  ...(await original<typeof import("@/lib/pushover/client")>()),
  verifyPushover: async () => ({ ok: true }),
}));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({}) } }));
vi.mock("@/lib/email/client", async (original) => ({
  ...(await original<typeof import("@/lib/email/client")>()),
  verifyEmail: verify.email,
}));

import { clearChannel, getChannelConfig, getChannelSummaries, testAndSaveEmail, testAndSaveTelegram } from "./channels";

const botToken = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw";

beforeEach(async () => {
  store.clear();
  for (const kind of ["telegram", "pushover", "email"] as const) await clearChannel(kind);
  verify.telegram.mockClear();
  verify.email.mockClear();
});

describe("notification channel settings", () => {
  it("saves only after the test message goes through", async () => {
    verify.email.mockResolvedValueOnce({ ok: false, error: "535 Authentication failed" });
    const failed = await testAndSaveEmail({
      host: "smtp.example.com",
      port: "587",
      username: "me",
      password: "wrong",
      from: "m@example.com",
      to: "a@example.com",
    });
    expect(failed).toMatchObject({ ok: false, error: expect.stringContaining("535 Authentication failed") });
    expect(await getChannelConfig("email")).toBeNull();
  });

  it("keeps a saved token when it's left blank", async () => {
    expect(await testAndSaveTelegram({ botToken, chatId: "111" })).toEqual({ ok: true });
    expect(await testAndSaveTelegram({ botToken: "", chatId: "222" })).toEqual({ ok: true });
    expect(await getChannelConfig("telegram")).toEqual({ botToken, chatId: "222" });
  });

  it("keeps the SMTP password only for the same server and login", async () => {
    const setup = { host: "smtp.example.com", port: "587", username: "me", from: "m@example.com", to: "a@example.com, b@example.com" };
    expect(await testAndSaveEmail({ ...setup, password: "secret", secure: "on" })).toEqual({ ok: true });
    expect(await testAndSaveEmail({ ...setup, password: "" })).toEqual({ ok: true });
    expect(await getChannelConfig("email")).toMatchObject({ password: "secret", secure: false, to: ["a@example.com", "b@example.com"] });

    const moved = await testAndSaveEmail({ ...setup, host: "smtp.other.com", password: "" });
    expect(moved).toMatchObject({ ok: false, error: expect.stringMatching(/password again/) });
  });

  it("never shows a secret in the summary", async () => {
    await testAndSaveTelegram({ botToken, chatId: "111" });
    const summary = await getChannelSummaries();
    expect(summary.telegram).toEqual({ connected: true, chatId: "111" });
    expect(JSON.stringify(summary)).not.toContain(botToken);
    expect(summary.email.connected).toBe(false);
  });
});
