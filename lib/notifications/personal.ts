import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userNotificationChannels, userNotificationChannelKindValues, type UserNotificationChannelKind } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto/encryption";
import { fail, type CoreResult } from "@/lib/core-result";
import { checkRateLimit } from "@/lib/rate-limit";
import { getChannelConfig } from "@/lib/notifications/channels";
import { getNtfyUrl } from "@/lib/integrations/app-settings";
import { deliverTelegram, findTelegramStart, telegramBotUsername } from "@/lib/telegram/client";
import { deliverPushover } from "@/lib/pushover/client";
import { deliverEmail } from "@/lib/email/client";
import { encodeHeaderValue } from "@/lib/ntfy/client";
import { postOutbound, privateAddressesAllowedForMembers, type OutboundResult } from "@/lib/notifications/outbound";
import {
  destinationKey,
  maskedTarget,
  ntfyServerOf,
  ntfyUrlFor,
  parsePersonalConfig,
  type ConfigContext,
  type PersonalChannelConfig,
} from "@/lib/notifications/personal-config";
import { getT, translatorForUser } from "@/lib/i18n/server";
import { englishT } from "@/lib/i18n/catalog";
import type { Translator } from "@/lib/i18n/translator";

// Each account's own notification channels (Settings › Account ›
// Notifications, /api/v1/me/notification-channels). Every query here is
// scoped to the owner, so one account can never see, change, test or send
// through another's: an id that isn't yours reads exactly like one that
// doesn't exist.

type ChannelRow = typeof userNotificationChannels.$inferSelect;

export const MAX_CHANNELS_PER_USER = 10;
const VERIFY_TTL_MS = 30 * 60 * 1000;
const VERIFY_MAX_ATTEMPTS = 5;
/** A personal channel gets at most this many notifications per window;
 * past that they're dropped (the bell still has them) until it passes. */
export const CHANNEL_RATE_LIMIT = { count: 30, windowMs: 10 * 60 * 1000 };

/** Delivery only looks at the role; the permissions ride along for the
 * notification preferences (lib/notifications/preferences.ts). */
export type Actor = { id: string; role: string; permissions?: readonly string[] };

export function isChannelKind(value: unknown): value is UserNotificationChannelKind {
  return typeof value === "string" && (userNotificationChannelKindValues as readonly string[]).includes(value);
}

// ── What the household offers ───────────────────────────────────────────

export type ChannelAvailability = {
  telegram: { available: boolean; botUsername: string | null };
  pushover: { available: boolean };
  email: { available: boolean };
  discord: { available: boolean };
  ntfy: { available: boolean; householdServer: string | null };
  webhook: { available: boolean; homeNetwork: boolean };
};

let botNameCache: { token: string; name: string | null; expiresAt: number } | null = null;

async function botUsername(token: string): Promise<string | null> {
  if (botNameCache && botNameCache.token === token && Date.now() < botNameCache.expiresAt) return botNameCache.name;
  const name = await telegramBotUsername(token);
  botNameCache = { token, name, expiresAt: Date.now() + (name ? 60 * 60 * 1000 : 60 * 1000) };
  return name;
}

/** Private addresses: the admin's own URLs can reach the home network, as
 * the household channels always could; members' can't unless the server
 * says so (MARQUEE_ALLOW_PRIVATE_WEBHOOKS). */
function policyFor(actor: Actor) {
  return { allowPrivate: actor.role === "admin" || privateAddressesAllowedForMembers() };
}

async function configContext(actor: Actor, t: Translator): Promise<ConfigContext> {
  return { ntfyServer: ntfyServerOf(await getNtfyUrl().catch(() => null)), policy: policyFor(actor), t };
}

export async function getAvailability(actor: Actor): Promise<ChannelAvailability> {
  const [telegram, pushover, email, ntfyUrl] = await Promise.all([
    getChannelConfig("telegram"),
    getChannelConfig("pushover"),
    getChannelConfig("email"),
    getNtfyUrl().catch(() => null),
  ]);
  return {
    telegram: { available: Boolean(telegram), botUsername: telegram ? await botUsername(telegram.botToken) : null },
    pushover: { available: Boolean(pushover) },
    email: { available: Boolean(email) },
    discord: { available: true },
    ntfy: { available: true, householdServer: ntfyServerOf(ntfyUrl) },
    webhook: { available: true, homeNetwork: policyFor(actor).allowPrivate },
  };
}

// ── Reading ─────────────────────────────────────────────────────────────

export type PersonalChannel = {
  id: string;
  kind: UserNotificationChannelKind;
  name: string | null;
  target: string;
  enabled: boolean;
  verified: boolean;
  lastSuccessAt: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
  createdAt: Date;
};

function toChannel(row: ChannelRow): PersonalChannel {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    target: row.target,
    enabled: row.enabled,
    verified: row.verified,
    lastSuccessAt: row.lastSuccessAt,
    lastError: row.lastError,
    lastErrorAt: row.lastErrorAt,
    createdAt: row.createdAt,
  };
}

export async function listChannels(userId: string): Promise<PersonalChannel[]> {
  const rows = await db
    .select()
    .from(userNotificationChannels)
    .where(eq(userNotificationChannels.userId, userId))
    .orderBy(asc(userNotificationChannels.createdAt));
  return rows.map(toChannel);
}

async function ownRow(userId: string, id: string): Promise<ChannelRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select()
    .from(userNotificationChannels)
    .where(and(eq(userNotificationChannels.id, id), eq(userNotificationChannels.userId, userId)))
    .limit(1);
  return row ?? null;
}

function readConfig(row: Pick<ChannelRow, "configEnc" | "configIv" | "configTag">): PersonalChannelConfig | null {
  try {
    return JSON.parse(decryptSecret({ ciphertext: row.configEnc, iv: row.configIv, tag: row.configTag }));
  } catch {
    // Unreadable (the encryption key changed): it can't send until re-entered.
    return null;
  }
}

function sealConfig(config: PersonalChannelConfig) {
  const sealed = encryptSecret(JSON.stringify(config));
  return { configEnc: sealed.ciphertext, configIv: sealed.iv, configTag: sealed.tag };
}

const NOT_FOUND = "notify.channelNotFound";

// ── Sending ─────────────────────────────────────────────────────────────

export type ChannelMessage = {
  /** "✅ Dune is ready to watch" — the whole line for chat-style channels. */
  line: string;
  /** Short heading: the title the notification is about. */
  heading: string;
  message: string;
  /** Webhook payload extras. */
  event: string;
  preference: string;
  mediaType?: string;
  tmdbId?: number;
};

/** Sends one message through one channel. Needs the household pieces it
 * rides on (the bot, the app token, the mail server) to still be there.
 * `t`: the channel owner's language, for the email footer and any reason
 * it didn't go. */
export async function sendThrough(
  config: PersonalChannelConfig,
  message: ChannelMessage,
  actor: Actor,
  t: Translator,
): Promise<OutboundResult> {
  switch (config.kind) {
    case "telegram": {
      const household = await getChannelConfig("telegram");
      if (!household) return { ok: false, error: t("notify.householdTelegramGone") };
      return deliverTelegram({ botToken: household.botToken, chatId: config.chatId }, message.line, t);
    }
    case "pushover": {
      const household = await getChannelConfig("pushover");
      if (!household) return { ok: false, error: t("notify.householdPushoverGone") };
      return deliverPushover({ appToken: household.appToken, userKey: config.userKey }, message.heading, message.message, t);
    }
    case "email": {
      const household = await getChannelConfig("email");
      if (!household) return { ok: false, error: t("notify.householdEmailGone") };
      return deliverEmail(
        { ...household, to: [config.address] },
        message.line,
        `${message.message}\n\n— Marquee\n\n${t("notify.personalEmailFooter")}`,
      );
    }
    case "discord":
      // Discord's own address, fixed by the pattern it was saved with.
      return postOutbound(
        config.webhookUrl,
        {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: message.line, allowed_mentions: { parse: [] } }),
        },
        { allowPrivate: false },
        t,
      );
    case "ntfy": {
      const server = ntfyServerOf(await getNtfyUrl().catch(() => null));
      const url = ntfyUrlFor(config, server);
      if (!url) return { ok: false, error: t("notify.householdNtfyGone") };
      return postOutbound(
        url,
        {
          headers: { "Content-Type": "text/plain; charset=utf-8", Title: encodeHeaderValue(message.heading) },
          body: message.message,
        },
        // The household server is the admin's choice; a full URL is the member's.
        config.topic ? { allowPrivate: true } : policyFor(actor),
        t,
      );
    }
    case "webhook":
      return postOutbound(
        config.url,
        {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: message.event,
            preference: message.preference,
            title: message.heading,
            message: message.message,
            ...(message.mediaType ? { mediaType: message.mediaType, tmdbId: message.tmdbId } : {}),
          }),
        },
        policyFor(actor),
        t,
      );
  }
}

async function recordOutcome(id: string, result: OutboundResult): Promise<void> {
  await db
    .update(userNotificationChannels)
    .set(
      result.ok
        ? { lastSuccessAt: new Date(), lastError: null, lastErrorAt: null }
        : { lastError: result.error.slice(0, 300), lastErrorAt: new Date() },
    )
    .where(eq(userNotificationChannels.id, id));
}

/** A channel that can take notifications now, with where it sends. */
export type DeliverableChannel = { row: ChannelRow; config: PersonalChannelConfig; key: string };

export async function deliverableChannels(userId: string): Promise<DeliverableChannel[]> {
  const rows = await db
    .select()
    .from(userNotificationChannels)
    .where(and(eq(userNotificationChannels.userId, userId), eq(userNotificationChannels.enabled, true)));
  if (rows.length === 0) return [];
  const server = ntfyServerOf(await getNtfyUrl().catch(() => null));
  const usable: DeliverableChannel[] = [];
  for (const row of rows) {
    // An email address nobody has confirmed gets nothing but its code.
    if (!row.verified) continue;
    const config = readConfig(row);
    if (!config) continue;
    usable.push({ row, config, key: destinationKey(config, server) });
  }
  return usable;
}

/** One notification to one of someone's channels: rate limited, and the
 * outcome is kept on the channel for Settings to show (in `t`, the owner's
 * language; looked up when not given). Never throws. */
export async function deliverToChannel(
  channel: DeliverableChannel,
  message: ChannelMessage,
  actor: Actor,
  t?: Translator,
): Promise<boolean> {
  try {
    const reader = t ?? (await translatorForUser(channel.row.userId).catch(() => englishT()));
    if (!checkRateLimit(`personal-channel:${channel.row.id}`, CHANNEL_RATE_LIMIT.count, CHANNEL_RATE_LIMIT.windowMs)) {
      await recordOutcome(channel.row.id, {
        ok: false,
        error: reader("notify.channelRateLimited", {
          count: CHANNEL_RATE_LIMIT.count,
          minutes: CHANNEL_RATE_LIMIT.windowMs / 60000,
        }),
      });
      return false;
    }
    const result = await sendThrough(channel.config, message, actor, reader);
    await recordOutcome(channel.row.id, result);
    return result.ok;
  } catch (err) {
    console.error("[notifications] personal channel failed:", err);
    return false;
  }
}

// ── Adding, changing, removing ──────────────────────────────────────────

function cleanName(value: unknown, t: Translator): string | null | { error: string } {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return { error: t("notify.fieldMustBeText", { field: "name" }) };
  const name = value.trim();
  if (name.length > 60) return { error: t("notify.channelNameTooLong", { count: 60 }) };
  return name || null;
}

/** "Send a test", in the language of whoever pressed it. */
function testMessage(t: Translator): ChannelMessage {
  const text = t("notify.channelTestMessage");
  return { line: `✅ ${text}`, heading: "Marquee", message: text, event: "test", preference: "test" };
}

function hashCode(channelId: string, code: string): string {
  return createHash("sha256").update(`${channelId}:${code}`).digest("hex");
}

/** Email always, and a Telegram chat ID typed in by hand, have to prove
 * they're yours: the chat could be anyone who ever pressed Start on the
 * household bot. (The one-tap Telegram link proves it by itself.) */
function needsCode(config: PersonalChannelConfig): config is Extract<PersonalChannelConfig, { kind: "email" | "telegram" }> {
  return config.kind === "email" || config.kind === "telegram";
}

async function sendVerificationCode(
  row: Pick<ChannelRow, "id">,
  config: Extract<PersonalChannelConfig, { kind: "email" | "telegram" }>,
  t: Translator,
): Promise<CoreResult> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  if (config.kind === "email") {
    const household = await getChannelConfig("email");
    if (!household) return fail("conflict", t("notify.emailNotSetUp"));
    const sent = await deliverEmail(
      { ...household, to: [config.address] },
      t("notify.codeEmailSubject", { code }),
      `${t("notify.codeEmailBody", { code, minutes: 30 })}\n\n— Marquee`,
    );
    if (!sent.ok) return fail("invalid", t("notify.codeEmailFailed", { error: sent.error }));
  } else {
    const household = await getChannelConfig("telegram");
    if (!household) return fail("conflict", t("notify.telegramNotSetUp"));
    const sent = await deliverTelegram(
      { botToken: household.botToken, chatId: config.chatId },
      t("notify.codeTelegram", { code, minutes: 30 }),
      t,
    );
    if (!sent.ok) return fail("invalid", t("notify.codeTelegramFailed", { error: sent.error }));
  }
  await db
    .update(userNotificationChannels)
    .set({ verifyCodeHash: hashCode(row.id, code), verifyExpiresAt: new Date(Date.now() + VERIFY_TTL_MS), verifyAttempts: 0 })
    .where(eq(userNotificationChannels.id, row.id));
  return { ok: true };
}

/** What a kind needs from the household before anyone can add it. */
async function kindUnavailable(kind: UserNotificationChannelKind, t: Translator): Promise<string | null> {
  if (kind === "telegram" && !(await getChannelConfig("telegram"))) {
    return t("notify.telegramNotSetUp");
  }
  if (kind === "pushover" && !(await getChannelConfig("pushover"))) {
    return t("notify.pushoverNotSetUp");
  }
  if (kind === "email" && !(await getChannelConfig("email"))) {
    return t("notify.emailNotSetUp");
  }
  return null;
}

/**
 * Adds a channel. A test message goes out first and it's saved only if that
 * arrives — except email and a hand-typed Telegram chat, which instead get
 * a confirmation code and nothing else until the code is entered.
 */
export async function createChannel(
  actor: Actor,
  input: { kind?: unknown; name?: unknown; enabled?: unknown; config?: unknown },
  /** The chat was found through the one-tap Telegram link: already proven. */
  options: { proven?: boolean } = {},
): Promise<CoreResult<{ channel: PersonalChannel }>> {
  const t = await getT();
  if (!isChannelKind(input.kind)) return fail("invalid", t("notify.channelKindInvalid"));
  const kind = input.kind;
  const name = cleanName(input.name, t);
  if (name && typeof name === "object") return fail("invalid", name.error);
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") return fail("invalid", t("notify.fieldMustBeBoolean", { field: "enabled" }));
  const raw = input.config && typeof input.config === "object" && !Array.isArray(input.config) ? (input.config as Record<string, unknown>) : null;
  if (!raw) return fail("invalid", t("notify.channelConfigMissing"));

  const unavailable = await kindUnavailable(kind, t);
  if (unavailable) return fail("conflict", unavailable);

  const [{ total }] = await db
    .select({ total: count() })
    .from(userNotificationChannels)
    .where(eq(userNotificationChannels.userId, actor.id));
  if (total >= MAX_CHANNELS_PER_USER) return fail("conflict", t("notify.channelLimit", { count: MAX_CHANNELS_PER_USER }));

  // Every add sends something somewhere, so it's limited like sign-in.
  if (!checkRateLimit(`personal-channel-add:${actor.id}`, 10, 10 * 60 * 1000)) {
    return fail("rate_limited", t("notify.channelAddRateLimited"));
  }

  const parsed = parsePersonalConfig(kind, raw, null, await configContext(actor, t));
  if (!parsed.ok) return fail("invalid", parsed.error);
  const config = parsed.config;
  const confirm = needsCode(config) && !options.proven;

  if (!confirm) {
    const test = await sendThrough(config, testMessage(t), actor, t);
    if (!test.ok) return fail("invalid", t("notify.channelTestFailed", { error: test.error }));
  }

  const [row] = await db
    .insert(userNotificationChannels)
    .values({
      userId: actor.id,
      kind,
      name: typeof name === "string" ? name : null,
      target: maskedTarget(config),
      ...sealConfig(config),
      enabled: input.enabled === false ? false : true,
      verified: !confirm,
      lastSuccessAt: confirm ? null : new Date(),
    })
    .returning();

  if (confirm && needsCode(config)) {
    const sent = await sendVerificationCode(row, config, t);
    if (!sent.ok) {
      await db.delete(userNotificationChannels).where(eq(userNotificationChannels.id, row.id));
      return sent;
    }
  }
  return { ok: true, channel: toChannel(row) };
}

/** `{ name?, enabled?, config? }`. New details are tested before they're
 * kept; a secret left blank keeps the saved one. A new email address needs
 * confirming again. */
export async function updateChannel(
  actor: Actor,
  id: string,
  input: { name?: unknown; enabled?: unknown; config?: unknown },
): Promise<CoreResult<{ channel: PersonalChannel }>> {
  const t = await getT();
  const row = await ownRow(actor.id, id);
  if (!row) return fail("not_found", t(NOT_FOUND));
  const set: Partial<typeof userNotificationChannels.$inferInsert> = { updatedAt: new Date() };

  if (input.name !== undefined) {
    const name = cleanName(input.name, t);
    if (name && typeof name === "object") return fail("invalid", name.error);
    set.name = name as string | null;
  }
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") return fail("invalid", t("notify.fieldMustBeBoolean", { field: "enabled" }));
    set.enabled = input.enabled;
  }

  let toConfirm: Extract<PersonalChannelConfig, { kind: "email" | "telegram" }> | null = null;
  if (input.config !== undefined) {
    const raw = input.config && typeof input.config === "object" && !Array.isArray(input.config) ? (input.config as Record<string, unknown>) : null;
    if (!raw) return fail("invalid", t("notify.fieldMustBeObject", { field: "config" }));
    const unavailable = await kindUnavailable(row.kind, t);
    if (unavailable) return fail("conflict", unavailable);
    const parsed = parsePersonalConfig(row.kind, raw, readConfig(row), await configContext(actor, t));
    if (!parsed.ok) return fail("invalid", parsed.error);
    const config = parsed.config;
    const before = readConfig(row);
    const changed = JSON.stringify(before) !== JSON.stringify(config);
    if (changed) {
      if (needsCode(config)) {
        toConfirm = config;
        set.verified = false;
      } else {
        if (!checkRateLimit(`personal-channel-add:${actor.id}`, 10, 10 * 60 * 1000)) {
          return fail("rate_limited", t("notify.channelChangeRateLimited"));
        }
        const test = await sendThrough(config, testMessage(t), actor, t);
        if (!test.ok) return fail("invalid", t("notify.channelTestFailed", { error: test.error }));
        set.lastSuccessAt = new Date();
        set.lastError = null;
        set.lastErrorAt = null;
      }
      Object.assign(set, sealConfig(config), { target: maskedTarget(config) });
    }
  }

  if (toConfirm) {
    if (!checkRateLimit(`personal-channel-code:${row.id}`, 3, 10 * 60 * 1000)) {
      return fail("rate_limited", t("notify.codeRecentlySent"));
    }
    const sent = await sendVerificationCode(row, toConfirm, t);
    if (!sent.ok) return sent;
  }

  const [updated] = await db
    .update(userNotificationChannels)
    .set(set)
    .where(and(eq(userNotificationChannels.id, row.id), eq(userNotificationChannels.userId, actor.id)))
    .returning();
  return { ok: true, channel: toChannel(updated) };
}

export async function deleteChannel(userId: string, id: string): Promise<CoreResult> {
  const t = await getT();
  const row = await ownRow(userId, id);
  if (!row) return fail("not_found", t(NOT_FOUND));
  await db
    .delete(userNotificationChannels)
    .where(and(eq(userNotificationChannels.id, row.id), eq(userNotificationChannels.userId, userId)));
  return { ok: true };
}

/** "Send a test": through this channel only; the outcome is kept on it. */
export async function testChannel(actor: Actor, id: string): Promise<CoreResult<{ channel: PersonalChannel }>> {
  const t = await getT();
  const row = await ownRow(actor.id, id);
  if (!row) return fail("not_found", t(NOT_FOUND));
  if (!row.verified) return fail("conflict", t("notify.codeEnterFirst"));
  const config = readConfig(row);
  if (!config) return fail("conflict", t("notify.channelUnreadable"));
  if (!checkRateLimit(`personal-channel-test:${actor.id}`, 5, 60 * 1000)) {
    return fail("rate_limited", t("notify.channelTestRateLimited"));
  }
  const result = await sendThrough(config, testMessage(t), actor, t);
  await recordOutcome(row.id, result);
  if (!result.ok) return fail("invalid", t("notify.channelTestFailed", { error: result.error }));
  return { ok: true, channel: toChannel((await ownRow(actor.id, id))!) };
}

export async function verifyChannel(userId: string, id: string, rawCode: unknown): Promise<CoreResult<{ channel: PersonalChannel }>> {
  const t = await getT();
  const row = await ownRow(userId, id);
  if (!row) return fail("not_found", t(NOT_FOUND));
  if (row.verified) return { ok: true, channel: toChannel(row) };
  const code = typeof rawCode === "string" ? rawCode.replace(/\s+/g, "") : "";
  if (!/^\d{6}$/.test(code)) return fail("invalid", t("notify.codeFormat"));
  if (!row.verifyCodeHash || !row.verifyExpiresAt || row.verifyExpiresAt < new Date()) {
    return fail("expired", t("notify.codeExpired"));
  }
  if (row.verifyAttempts >= VERIFY_MAX_ATTEMPTS) return fail("rate_limited", t("notify.codeTooManyWrong"));
  const expected = Buffer.from(row.verifyCodeHash, "hex");
  const given = Buffer.from(hashCode(row.id, code), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await db
      .update(userNotificationChannels)
      .set({ verifyAttempts: row.verifyAttempts + 1 })
      .where(eq(userNotificationChannels.id, row.id));
    return fail("invalid", t("notify.codeWrong"));
  }
  const [updated] = await db
    .update(userNotificationChannels)
    .set({ verified: true, verifyCodeHash: null, verifyExpiresAt: null, verifyAttempts: 0, updatedAt: new Date() })
    .where(and(eq(userNotificationChannels.id, row.id), eq(userNotificationChannels.userId, userId)))
    .returning();
  return { ok: true, channel: toChannel(updated) };
}

export async function resendVerification(userId: string, id: string): Promise<CoreResult<{ channel: PersonalChannel }>> {
  const t = await getT();
  const row = await ownRow(userId, id);
  if (!row) return fail("not_found", t(NOT_FOUND));
  if (row.verified) return fail("conflict", t("notify.channelAlreadyConfirmed"));
  const config = readConfig(row);
  if (!config || !needsCode(config)) return fail("conflict", t("notify.channelNoConfirmNeeded"));
  if (!checkRateLimit(`personal-channel-code:${row.id}`, 3, 10 * 60 * 1000)) {
    return fail("rate_limited", t("notify.codeRecentlySent"));
  }
  const sent = await sendVerificationCode(row, config, t);
  if (!sent.ok) return sent;
  return { ok: true, channel: toChannel((await ownRow(userId, id))!) };
}

// ── Connect Telegram without typing a chat ID ───────────────────────────

type TelegramLink = { userId: string; expiresAt: number };

declare global {
  var __marqueeTelegramLinks: Map<string, TelegramLink> | undefined;
}

// Single process (like the notification bus), so an in-memory map will do;
// a restart just means pressing "Connect" again.
const telegramLinks: Map<string, TelegramLink> = (globalThis.__marqueeTelegramLinks ??= new Map());
const TELEGRAM_LINK_TTL_MS = 10 * 60 * 1000;

/** A one-time "/start <code>" link to the household bot. */
export async function startTelegramLink(userId: string): Promise<CoreResult<{ code: string; url: string; expiresAt: Date }>> {
  const t = await getT();
  const household = await getChannelConfig("telegram");
  if (!household) return fail("conflict", t("notify.telegramNotSetUp"));
  const username = await botUsername(household.botToken);
  if (!username) return fail("upstream", t("notify.telegramBotUnreachable"));
  const now = Date.now();
  for (const [code, link] of telegramLinks) if (link.expiresAt < now) telegramLinks.delete(code);
  const code = randomBytes(12).toString("base64url");
  const expiresAt = now + TELEGRAM_LINK_TTL_MS;
  telegramLinks.set(code, { userId, expiresAt });
  return { ok: true, code, url: `https://t.me/${username}?start=${code}`, expiresAt: new Date(expiresAt) };
}

/** Pending until the bot has seen "/start <code>"; then the chat becomes a
 * channel (after its test message, like any other). */
export async function pollTelegramLink(
  actor: Actor,
  code: unknown,
  name?: unknown,
): Promise<CoreResult<{ status: "pending" } | { status: "connected"; channel: PersonalChannel }>> {
  const t = await getT();
  const link = typeof code === "string" ? telegramLinks.get(code) : undefined;
  // Someone else's code reads exactly like an expired one.
  if (!link || link.userId !== actor.id || link.expiresAt < Date.now()) {
    return fail("expired", t("notify.telegramLinkExpired"));
  }
  if (!checkRateLimit(`telegram-link-poll:${actor.id}`, 40, 60 * 1000)) {
    return fail("rate_limited", t("notify.telegramPollTooOften"));
  }
  const household = await getChannelConfig("telegram");
  if (!household) return fail("conflict", t("notify.telegramGone"));
  const found = await findTelegramStart(household.botToken, code as string);
  if (found.status === "unavailable") {
    return fail("conflict", t("notify.telegramBotUsesWebhook"));
  }
  if (found.status === "pending") return { ok: true, status: "pending" };
  // Two polls can both see it; only the one that takes the code adds it.
  if (!telegramLinks.delete(code as string)) return fail("expired", t("notify.telegramLinkUsed"));
  const created = await createChannel(actor, { kind: "telegram", name, config: { chatId: found.chatId } }, { proven: true });
  if (!created.ok) return created;
  return { ok: true, status: "connected", channel: created.channel };
}
