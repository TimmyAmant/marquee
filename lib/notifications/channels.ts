import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notificationChannels, type NotificationChannelKind } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto/encryption";
import { fail, type CoreResult } from "@/lib/core-result";
import { telegramConfigError, verifyTelegram, type TelegramConfig } from "@/lib/telegram/client";
import { pushoverConfigError, verifyPushover, type PushoverConfig } from "@/lib/pushover/client";
import { emailConfigError, parseRecipients, verifyEmail, type EmailConfig } from "@/lib/email/client";
import { getT } from "@/lib/i18n/server";
import {
  gotifyRequest,
  parseGotify,
  parsePushbullet,
  parseSlack,
  pushbulletRequest,
  send,
  slackRequest,
  type GotifyConfig,
  type PushbulletConfig,
  type SlackConfig,
} from "@/lib/notifications/services";

import type { TestOptions } from "@/lib/integrations/manage";

// Telegram, Pushover and email settings (Settings → Notifications,
// and /api/v1/settings/integrations/{telegram,pushover,email}).
// Each is saved only after a test message goes through, like Discord and
// ntfy. A blank secret on a later save keeps the saved one, so changing the
// chat or the recipients doesn't mean digging the token out again.

type Configs = {
  telegram: TelegramConfig;
  pushover: PushoverConfig;
  email: EmailConfig;
  gotify: GotifyConfig;
  slack: SlackConfig;
  pushbullet: PushbulletConfig;
};

// Same short cache as the other settings (lib/integrations/app-settings.ts):
// every notification reads all three.
const CACHE_TTL_MS = 30_000;
const cache = new Map<NotificationChannelKind, { value: unknown; expiresAt: number }>();

export async function getChannelConfig<K extends NotificationChannelKind>(kind: K): Promise<Configs[K] | null> {
  const hit = cache.get(kind);
  if (hit && Date.now() < hit.expiresAt) return hit.value as Configs[K] | null;
  const [row] = await db.select().from(notificationChannels).where(eq(notificationChannels.kind, kind)).limit(1);
  let value: Configs[K] | null = null;
  if (row) {
    try {
      value = JSON.parse(decryptSecret({ ciphertext: row.configEnc, iv: row.configIv, tag: row.configTag }));
    } catch {
      // Unreadable (the encryption key changed): treated as not set up.
      value = null;
    }
  }
  cache.set(kind, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

async function saveChannelConfig<K extends NotificationChannelKind>(kind: K, config: Configs[K]): Promise<void> {
  const encrypted = encryptSecret(JSON.stringify(config));
  const values = {
    configEnc: encrypted.ciphertext,
    configIv: encrypted.iv,
    configTag: encrypted.tag,
    updatedAt: new Date(),
  };
  await db
    .insert(notificationChannels)
    .values({ kind, ...values })
    .onConflictDoUpdate({ target: notificationChannels.kind, set: values });
  cache.delete(kind);
}

export async function clearChannel(kind: NotificationChannelKind): Promise<void> {
  await db.delete(notificationChannels).where(eq(notificationChannels.kind, kind));
  cache.delete(kind);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function testAndSaveTelegram(input: { botToken?: unknown; chatId?: unknown }, options: TestOptions = {}): Promise<CoreResult> {
  const saved = await getChannelConfig("telegram");
  const config: TelegramConfig = {
    botToken: text(input.botToken) || saved?.botToken || "",
    chatId: text(input.chatId),
  };
  const t = await getT();
  const invalid = telegramConfigError(config, t);
  if (invalid) return fail("invalid", invalid);
  const test = await verifyTelegram(config);
  if (!test.ok) return fail("invalid", t("notify.telegramTestFailed", { error: test.error }));
  // "Test": everything but the save.
  if (options.dryRun) return { ok: true };
  await saveChannelConfig("telegram", config);
  return { ok: true };
}

export async function testAndSavePushover(input: { appToken?: unknown; userKey?: unknown }, options: TestOptions = {}): Promise<CoreResult> {
  const saved = await getChannelConfig("pushover");
  const config: PushoverConfig = {
    appToken: text(input.appToken) || saved?.appToken || "",
    userKey: text(input.userKey),
  };
  const t = await getT();
  const invalid = pushoverConfigError(config, t);
  if (invalid) return fail("invalid", invalid);
  const test = await verifyPushover(config);
  if (!test.ok) return fail("invalid", t("notify.pushoverTestFailed", { error: test.error }));
  // "Test": everything but the save.
  if (options.dryRun) return { ok: true };
  await saveChannelConfig("pushover", config);
  return { ok: true };
}

export async function testAndSaveEmail(
  input: {
    host?: unknown;
    port?: unknown;
    secure?: unknown;
    username?: unknown;
    password?: unknown;
    from?: unknown;
    to?: unknown;
  },
  options: TestOptions = {},
): Promise<CoreResult> {
  const saved = await getChannelConfig("email");
  const host = text(input.host);
  const username = text(input.username) || null;
  const port = typeof input.port === "number" ? input.port : Number(text(input.port));
  // The saved password carries over only to the same server and account.
  const keepPassword = saved && saved.host === host && saved.username === username;
  const config: EmailConfig = {
    host,
    port,
    secure: input.secure === true || input.secure === "true" || input.secure === "on",
    username,
    password: (typeof input.password === "string" && input.password) || (keepPassword ? saved.password : null) || null,
    from: text(input.from),
    to: Array.isArray(input.to) ? input.to.map(text).filter(Boolean) : parseRecipients(text(input.to)),
  };
  const t = await getT();
  if (config.username && !config.password && saved?.password && !keepPassword) {
    return fail("invalid", t("notify.emailPasswordAgain"));
  }
  const invalid = emailConfigError(config, t);
  if (invalid) return fail("invalid", invalid);
  const test = await verifyEmail(config);
  if (!test.ok) return fail("invalid", t("notify.testEmailFailed", { error: test.error }));
  // "Test": everything but the save.
  if (options.dryRun) return { ok: true };
  await saveChannelConfig("email", config);
  return { ok: true };
}

// Gotify, Slack and Pushbullet (lib/notifications/services.ts): the admin's
// own addresses, so the home network is allowed, like the other household
// channels. Each sends a test before it's saved.

const HOUSEHOLD_POLICY = { allowPrivate: true };

async function testAndSave<K extends "gotify" | "slack" | "pushbullet">(
  kind: K,
  parsed: { ok: true; config: Configs[K] } | { ok: false; error: string },
  test: (config: Configs[K], line: string) => ReturnType<typeof send>,
  options: TestOptions,
): Promise<CoreResult> {
  const t = await getT();
  if (!parsed.ok) return fail("invalid", parsed.error);
  const result = await test(parsed.config, `✅ ${t("notify.connectedChat")}`);
  if (!result.ok) return fail("invalid", t("notify.channelTestFailed", { error: result.error }));
  if (options.dryRun) return { ok: true };
  await saveChannelConfig(kind, parsed.config);
  return { ok: true };
}

export async function testAndSaveGotify(input: Record<string, unknown>, options: TestOptions = {}): Promise<CoreResult> {
  const t = await getT();
  const parsed = parseGotify(input, await getChannelConfig("gotify"), HOUSEHOLD_POLICY, t);
  return testAndSave("gotify", parsed, (config, line) => send(gotifyRequest(config, "Marquee", line), HOUSEHOLD_POLICY, t), options);
}

export async function testAndSaveSlack(input: Record<string, unknown>, options: TestOptions = {}): Promise<CoreResult> {
  const t = await getT();
  const parsed = parseSlack(input, await getChannelConfig("slack"), HOUSEHOLD_POLICY, t);
  return testAndSave("slack", parsed, (config, line) => send(slackRequest(config, line), HOUSEHOLD_POLICY, t), options);
}

export async function testAndSavePushbullet(input: Record<string, unknown>, options: TestOptions = {}): Promise<CoreResult> {
  const t = await getT();
  const parsed = parsePushbullet(input, await getChannelConfig("pushbullet"), t);
  return testAndSave(
    "pushbullet",
    parsed,
    (config, line) => send(pushbulletRequest(config, "Marquee", line), { allowPrivate: false }, t),
    options,
  );
}

/** What Settings shows about each, without any secret. */
export type ChannelSummaries = {
  telegram: { connected: boolean; chatId: string | null };
  pushover: { connected: boolean };
  email: {
    connected: boolean;
    host: string | null;
    port: number | null;
    secure: boolean;
    username: string | null;
    from: string | null;
    to: string[];
  };
  gotify: { connected: boolean; url: string | null; priority: number | null };
  slack: { connected: boolean };
  pushbullet: { connected: boolean; channelTag: string | null };
};

export async function getChannelSummaries(): Promise<ChannelSummaries> {
  const [telegram, pushover, email, gotify, slack, pushbullet] = await Promise.all([
    getChannelConfig("telegram"),
    getChannelConfig("pushover"),
    getChannelConfig("email"),
    getChannelConfig("gotify"),
    getChannelConfig("slack"),
    getChannelConfig("pushbullet"),
  ]);
  return {
    telegram: { connected: Boolean(telegram), chatId: telegram?.chatId ?? null },
    pushover: { connected: Boolean(pushover) },
    email: {
      connected: Boolean(email),
      host: email?.host ?? null,
      port: email?.port ?? null,
      secure: email?.secure ?? false,
      username: email?.username ?? null,
      from: email?.from ?? null,
      to: email?.to ?? [],
    },
    gotify: { connected: Boolean(gotify), url: gotify?.url ?? null, priority: gotify?.priority ?? null },
    slack: { connected: Boolean(slack) },
    pushbullet: { connected: Boolean(pushbullet), channelTag: pushbullet?.channelTag ?? null },
  };
}
