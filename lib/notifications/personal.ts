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

export type Actor = { id: string; role: string };

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

async function configContext(actor: Actor): Promise<ConfigContext> {
  return { ntfyServer: ntfyServerOf(await getNtfyUrl().catch(() => null)), policy: policyFor(actor) };
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

const NOT_FOUND = "There's no channel with that id.";

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
 * rides on (the bot, the app token, the mail server) to still be there. */
export async function sendThrough(config: PersonalChannelConfig, message: ChannelMessage, actor: Actor): Promise<OutboundResult> {
  switch (config.kind) {
    case "telegram": {
      const household = await getChannelConfig("telegram");
      if (!household) return { ok: false, error: "The household's Telegram bot isn't set up any more." };
      return deliverTelegram({ botToken: household.botToken, chatId: config.chatId }, message.line);
    }
    case "pushover": {
      const household = await getChannelConfig("pushover");
      if (!household) return { ok: false, error: "The household's Pushover app isn't set up any more." };
      return deliverPushover({ appToken: household.appToken, userKey: config.userKey }, message.heading, message.message);
    }
    case "email": {
      const household = await getChannelConfig("email");
      if (!household) return { ok: false, error: "The household's mail server isn't set up any more." };
      return deliverEmail(
        { ...household, to: [config.address] },
        message.line,
        `${message.message}\n\n— Marquee\n\nYou get these because you added this address under Settings › Account › Notifications in Marquee. Turn them off there.`,
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
      );
    case "ntfy": {
      const server = ntfyServerOf(await getNtfyUrl().catch(() => null));
      const url = ntfyUrlFor(config, server);
      if (!url) return { ok: false, error: "The household's ntfy server isn't set up any more." };
      return postOutbound(
        url,
        {
          headers: { "Content-Type": "text/plain; charset=utf-8", Title: encodeHeaderValue(message.heading) },
          body: message.message,
        },
        // The household server is the admin's choice; a full URL is the member's.
        config.topic ? { allowPrivate: true } : policyFor(actor),
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
 * outcome is kept on the channel for Settings to show. Never throws. */
export async function deliverToChannel(channel: DeliverableChannel, message: ChannelMessage, actor: Actor): Promise<boolean> {
  try {
    if (!checkRateLimit(`personal-channel:${channel.row.id}`, CHANNEL_RATE_LIMIT.count, CHANNEL_RATE_LIMIT.windowMs)) {
      await recordOutcome(channel.row.id, {
        ok: false,
        error: `Some notifications were skipped: more than ${CHANNEL_RATE_LIMIT.count} in ${CHANNEL_RATE_LIMIT.windowMs / 60000} minutes.`,
      });
      return false;
    }
    const result = await sendThrough(channel.config, message, actor);
    await recordOutcome(channel.row.id, result);
    return result.ok;
  } catch (err) {
    console.error("[notifications] personal channel failed:", err);
    return false;
  }
}

// ── Adding, changing, removing ──────────────────────────────────────────

function cleanName(value: unknown): string | null | { error: string } {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return { error: '"name" must be text.' };
  const name = value.trim();
  if (name.length > 60) return { error: "Keep the name under 60 characters." };
  return name || null;
}

const TEST_MESSAGE: ChannelMessage = {
  line: "✅ Marquee will send your notifications here.",
  heading: "Marquee",
  message: "Marquee will send your notifications here.",
  event: "test",
  preference: "test",
};

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
): Promise<CoreResult> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  if (config.kind === "email") {
    const household = await getChannelConfig("email");
    if (!household) return fail("conflict", "Email isn't set up on this server. Ask the admin to add a mail server.");
    const sent = await deliverEmail(
      { ...household, to: [config.address] },
      `Your Marquee confirmation code: ${code}`,
      `Your code is ${code}\n\nEnter it in Marquee (Settings › Account › Notifications) to get notifications at this address. It works for 30 minutes.\n\nIf you didn't ask for this, ignore this email — nothing more will be sent.\n\n— Marquee`,
    );
    if (!sent.ok) return fail("invalid", `The confirmation email didn't go through: ${sent.error}`);
  } else {
    const household = await getChannelConfig("telegram");
    if (!household) return fail("conflict", "Telegram isn't set up on this server. Ask the admin to add a Telegram bot.");
    const sent = await deliverTelegram(
      { botToken: household.botToken, chatId: config.chatId },
      `Your Marquee confirmation code is ${code}. Enter it in Marquee (Settings › Account › Notifications) within 30 minutes. If you didn't ask for this, ignore it.`,
    );
    if (!sent.ok) return fail("invalid", `The code didn't reach that chat: ${sent.error}`);
  }
  await db
    .update(userNotificationChannels)
    .set({ verifyCodeHash: hashCode(row.id, code), verifyExpiresAt: new Date(Date.now() + VERIFY_TTL_MS), verifyAttempts: 0 })
    .where(eq(userNotificationChannels.id, row.id));
  return { ok: true };
}

/** What a kind needs from the household before anyone can add it. */
async function kindUnavailable(kind: UserNotificationChannelKind): Promise<string | null> {
  if (kind === "telegram" && !(await getChannelConfig("telegram"))) {
    return "Telegram isn't set up on this server. Ask the admin to add a Telegram bot.";
  }
  if (kind === "pushover" && !(await getChannelConfig("pushover"))) {
    return "Pushover isn't set up on this server. Ask the admin to add a Pushover app.";
  }
  if (kind === "email" && !(await getChannelConfig("email"))) {
    return "Email isn't set up on this server. Ask the admin to add a mail server.";
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
  if (!isChannelKind(input.kind)) return fail("invalid", '"kind" must be telegram, pushover, email, discord, ntfy or webhook.');
  const kind = input.kind;
  const name = cleanName(input.name);
  if (name && typeof name === "object") return fail("invalid", name.error);
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") return fail("invalid", '"enabled" must be true or false.');
  const raw = input.config && typeof input.config === "object" && !Array.isArray(input.config) ? (input.config as Record<string, unknown>) : null;
  if (!raw) return fail("invalid", 'Send "config" with the channel\'s details.');

  const unavailable = await kindUnavailable(kind);
  if (unavailable) return fail("conflict", unavailable);

  const [{ total }] = await db
    .select({ total: count() })
    .from(userNotificationChannels)
    .where(eq(userNotificationChannels.userId, actor.id));
  if (total >= MAX_CHANNELS_PER_USER) return fail("conflict", `You can have up to ${MAX_CHANNELS_PER_USER} channels.`);

  // Every add sends something somewhere, so it's limited like sign-in.
  if (!checkRateLimit(`personal-channel-add:${actor.id}`, 10, 10 * 60 * 1000)) {
    return fail("rate_limited", "That's a lot of channels at once. Try again in a few minutes.");
  }

  const parsed = parsePersonalConfig(kind, raw, null, await configContext(actor));
  if (!parsed.ok) return fail("invalid", parsed.error);
  const config = parsed.config;
  const confirm = needsCode(config) && !options.proven;

  if (!confirm) {
    const test = await sendThrough(config, TEST_MESSAGE, actor);
    if (!test.ok) return fail("invalid", `The test message didn't arrive: ${test.error}`);
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
    const sent = await sendVerificationCode(row, config);
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
  const row = await ownRow(actor.id, id);
  if (!row) return fail("not_found", NOT_FOUND);
  const set: Partial<typeof userNotificationChannels.$inferInsert> = { updatedAt: new Date() };

  if (input.name !== undefined) {
    const name = cleanName(input.name);
    if (name && typeof name === "object") return fail("invalid", name.error);
    set.name = name as string | null;
  }
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") return fail("invalid", '"enabled" must be true or false.');
    set.enabled = input.enabled;
  }

  let toConfirm: Extract<PersonalChannelConfig, { kind: "email" | "telegram" }> | null = null;
  if (input.config !== undefined) {
    const raw = input.config && typeof input.config === "object" && !Array.isArray(input.config) ? (input.config as Record<string, unknown>) : null;
    if (!raw) return fail("invalid", '"config" must be an object.');
    const unavailable = await kindUnavailable(row.kind);
    if (unavailable) return fail("conflict", unavailable);
    const parsed = parsePersonalConfig(row.kind, raw, readConfig(row), await configContext(actor));
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
          return fail("rate_limited", "That's a lot of changes at once. Try again in a few minutes.");
        }
        const test = await sendThrough(config, TEST_MESSAGE, actor);
        if (!test.ok) return fail("invalid", `The test message didn't arrive: ${test.error}`);
        set.lastSuccessAt = new Date();
        set.lastError = null;
        set.lastErrorAt = null;
      }
      Object.assign(set, sealConfig(config), { target: maskedTarget(config) });
    }
  }

  if (toConfirm) {
    if (!checkRateLimit(`personal-channel-code:${row.id}`, 3, 10 * 60 * 1000)) {
      return fail("rate_limited", "A code was sent a moment ago. Try again in a few minutes.");
    }
    const sent = await sendVerificationCode(row, toConfirm);
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
  const row = await ownRow(userId, id);
  if (!row) return fail("not_found", NOT_FOUND);
  await db
    .delete(userNotificationChannels)
    .where(and(eq(userNotificationChannels.id, row.id), eq(userNotificationChannels.userId, userId)));
  return { ok: true };
}

/** "Send a test": through this channel only; the outcome is kept on it. */
export async function testChannel(actor: Actor, id: string): Promise<CoreResult<{ channel: PersonalChannel }>> {
  const row = await ownRow(actor.id, id);
  if (!row) return fail("not_found", NOT_FOUND);
  if (!row.verified) return fail("conflict", "Enter the code we sent first.");
  const config = readConfig(row);
  if (!config) return fail("conflict", "This channel's details can't be read any more. Enter them again.");
  if (!checkRateLimit(`personal-channel-test:${actor.id}`, 5, 60 * 1000)) {
    return fail("rate_limited", "That's a lot of tests. Try again in a minute.");
  }
  const result = await sendThrough(config, TEST_MESSAGE, actor);
  await recordOutcome(row.id, result);
  if (!result.ok) return fail("invalid", `The test message didn't arrive: ${result.error}`);
  return { ok: true, channel: toChannel((await ownRow(actor.id, id))!) };
}

export async function verifyChannel(userId: string, id: string, rawCode: unknown): Promise<CoreResult<{ channel: PersonalChannel }>> {
  const row = await ownRow(userId, id);
  if (!row) return fail("not_found", NOT_FOUND);
  if (row.verified) return { ok: true, channel: toChannel(row) };
  const code = typeof rawCode === "string" ? rawCode.replace(/\s+/g, "") : "";
  if (!/^\d{6}$/.test(code)) return fail("invalid", "The code is the 6 digits we sent.");
  if (!row.verifyCodeHash || !row.verifyExpiresAt || row.verifyExpiresAt < new Date()) {
    return fail("expired", "That code has expired. Send a new one.");
  }
  if (row.verifyAttempts >= VERIFY_MAX_ATTEMPTS) return fail("rate_limited", "Too many wrong codes. Send a new one.");
  const expected = Buffer.from(row.verifyCodeHash, "hex");
  const given = Buffer.from(hashCode(row.id, code), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await db
      .update(userNotificationChannels)
      .set({ verifyAttempts: row.verifyAttempts + 1 })
      .where(eq(userNotificationChannels.id, row.id));
    return fail("invalid", "That code isn't right. Check it and try again.");
  }
  const [updated] = await db
    .update(userNotificationChannels)
    .set({ verified: true, verifyCodeHash: null, verifyExpiresAt: null, verifyAttempts: 0, updatedAt: new Date() })
    .where(and(eq(userNotificationChannels.id, row.id), eq(userNotificationChannels.userId, userId)))
    .returning();
  return { ok: true, channel: toChannel(updated) };
}

export async function resendVerification(userId: string, id: string): Promise<CoreResult<{ channel: PersonalChannel }>> {
  const row = await ownRow(userId, id);
  if (!row) return fail("not_found", NOT_FOUND);
  if (row.verified) return fail("conflict", "This channel is already confirmed.");
  const config = readConfig(row);
  if (!config || !needsCode(config)) return fail("conflict", "This channel doesn't need confirming.");
  if (!checkRateLimit(`personal-channel-code:${row.id}`, 3, 10 * 60 * 1000)) {
    return fail("rate_limited", "A code was sent a moment ago. Try again in a few minutes.");
  }
  const sent = await sendVerificationCode(row, config);
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
  const household = await getChannelConfig("telegram");
  if (!household) return fail("conflict", "Telegram isn't set up on this server. Ask the admin to add a Telegram bot.");
  const username = await botUsername(household.botToken);
  if (!username) return fail("upstream", "Couldn't reach the household's Telegram bot. Enter your chat ID instead.");
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
  const link = typeof code === "string" ? telegramLinks.get(code) : undefined;
  // Someone else's code reads exactly like an expired one.
  if (!link || link.userId !== actor.id || link.expiresAt < Date.now()) {
    return fail("expired", "That link has expired. Press Connect again.");
  }
  if (!checkRateLimit(`telegram-link-poll:${actor.id}`, 40, 60 * 1000)) {
    return fail("rate_limited", "Checking too often. Wait a moment.");
  }
  const household = await getChannelConfig("telegram");
  if (!household) return fail("conflict", "Telegram isn't set up on this server any more.");
  const found = await findTelegramStart(household.botToken, code as string);
  if (found.status === "unavailable") {
    return fail("conflict", "The household bot can't be checked from here (it uses a webhook). Enter your chat ID instead.");
  }
  if (found.status === "pending") return { ok: true, status: "pending" };
  // Two polls can both see it; only the one that takes the code adds it.
  if (!telegramLinks.delete(code as string)) return fail("expired", "That link has already been used.");
  const created = await createChannel(actor, { kind: "telegram", name, config: { chatId: found.chatId } }, { proven: true });
  if (!created.ok) return created;
  return { ok: true, status: "connected", channel: created.channel };
}
