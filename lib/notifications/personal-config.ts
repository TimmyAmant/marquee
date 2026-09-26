import type { UserNotificationChannelKind } from "@/lib/db/schema";
import { isEmailAddress } from "@/lib/email/client";
import { outboundUrlError, type OutboundPolicy } from "@/lib/notifications/outbound";

// What each kind of personal channel keeps, how what someone typed becomes
// that, and the masked form Settings shows. Pure; unit tested
// (personal-config.test.ts). The saving and sending are in personal.ts.

export type PersonalChannelConfig =
  | { kind: "telegram"; chatId: string }
  | { kind: "pushover"; userKey: string }
  | { kind: "email"; address: string }
  | { kind: "discord"; webhookUrl: string }
  /** `topic`: on the household's ntfy server; `url`: anywhere else. */
  | { kind: "ntfy"; topic: string; url?: undefined }
  | { kind: "ntfy"; url: string; topic?: undefined }
  | { kind: "webhook"; url: string };

export type ConfigContext = {
  /** The household ntfy server (its address without the topic), or null. */
  ntfyServer: string | null;
  policy: OutboundPolicy;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const DISCORD_WEBHOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,30}\/[A-Za-z0-9_-]{20,200}$/;
const NTFY_TOPIC = /^[A-Za-z0-9_-]{1,64}$/;

/** The household ntfy topic URL's server: https://ntfy.sh/family → https://ntfy.sh. */
export function ntfyServerOf(topicUrl: string | null): string | null {
  if (!topicUrl) return null;
  try {
    const url = new URL(topicUrl);
    const path = url.pathname.replace(/\/+$/, "");
    const base = path.slice(0, path.lastIndexOf("/"));
    return `${url.origin}${base}`;
  } catch {
    return null;
  }
}

/**
 * Turns what was typed into a config, or says what's wrong. `saved`: the
 * channel's current config when editing — a secret left blank keeps it,
 * like the household channels' forms.
 */
export function parsePersonalConfig(
  kind: UserNotificationChannelKind,
  input: Record<string, unknown>,
  saved: PersonalChannelConfig | null,
  context: ConfigContext,
): { ok: true; config: PersonalChannelConfig } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  const same = saved?.kind === kind ? saved : null;
  switch (kind) {
    case "telegram": {
      const chatId = text(input.chatId);
      // Someone's own chat with the bot: a positive number. Groups and
      // channels are the household's business.
      if (!/^\d{1,20}$/.test(chatId)) {
        return fail("Your chat ID is a number. Send the bot /start, and it's in the reply you get from @userinfobot.");
      }
      return { ok: true, config: { kind, chatId } };
    }
    case "pushover": {
      const userKey = text(input.userKey) || (same?.kind === "pushover" ? same.userKey : "");
      if (!/^[A-Za-z0-9]{30}$/.test(userKey)) {
        return fail("Your user key is the 30-character code at the top of your pushover.net dashboard.");
      }
      return { ok: true, config: { kind, userKey } };
    }
    case "email": {
      const address = text(input.address).toLowerCase();
      if (!isEmailAddress(address)) return fail("Enter your email address, like you@example.com.");
      return { ok: true, config: { kind, address } };
    }
    case "discord": {
      const webhookUrl = text(input.webhookUrl) || (same?.kind === "discord" ? same.webhookUrl : "");
      if (!webhookUrl) return fail("Enter your Discord webhook URL.");
      if (!DISCORD_WEBHOOK.test(webhookUrl)) {
        return fail("That doesn't look like a Discord webhook URL. In Discord: channel settings › Integrations › Webhooks › Copy Webhook URL.");
      }
      return { ok: true, config: { kind, webhookUrl } };
    }
    case "ntfy": {
      const topic = text(input.topic);
      const url = text(input.url);
      if (topic) {
        if (!context.ntfyServer) return fail("This household has no ntfy server set up. Enter a full topic URL instead.");
        if (!NTFY_TOPIC.test(topic)) return fail("A topic is letters, numbers, - and _ (up to 64).");
        return { ok: true, config: { kind, topic } };
      }
      const chosen = url || (same?.kind === "ntfy" && same.url ? same.url : "");
      if (!chosen) return fail(context.ntfyServer ? "Enter a topic name or a full topic URL." : "Enter your ntfy topic URL, like https://ntfy.sh/your-topic.");
      const invalid = outboundUrlError(chosen, context.policy);
      if (invalid) return fail(invalid);
      return { ok: true, config: { kind, url: chosen } };
    }
    case "webhook": {
      const url = text(input.url) || (same?.kind === "webhook" ? same.url : "");
      if (!url) return fail("Enter the webhook URL.");
      const invalid = outboundUrlError(url, context.policy);
      if (invalid) return fail(invalid);
      return { ok: true, config: { kind, url } };
    }
  }
}

/** Where a config sends: the full URL for ntfy on the household server. */
export function ntfyUrlFor(config: Extract<PersonalChannelConfig, { kind: "ntfy" }>, ntfyServer: string | null): string | null {
  if (config.url) return config.url;
  return ntfyServer ? `${ntfyServer}/${config.topic}` : null;
}

const DOTS = "••••";

function tail(value: string, count = 4): string {
  return value.length > count ? value.slice(-count) : "";
}

function maskUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.host}/${DOTS}`;
  } catch {
    return DOTS;
  }
}

/** What Settings shows for a channel: enough to tell two apart, never the
 * secret that lets someone post to it. */
export function maskedTarget(config: PersonalChannelConfig): string {
  switch (config.kind) {
    case "telegram":
      return `Chat ${DOTS}${tail(config.chatId)}`;
    case "pushover":
      return `Key ${DOTS}${tail(config.userKey)}`;
    case "email":
      // Your own address isn't a secret, and it's where the code went.
      return config.address;
    case "discord": {
      const id = config.webhookUrl.match(/webhooks\/(\d+)\//)?.[1] ?? "";
      return `Discord webhook ${DOTS}${tail(id)}`;
    }
    case "ntfy":
      return config.topic ? `Topic ${config.topic.slice(0, 2)}${DOTS}` : maskUrl(config.url ?? "");
    case "webhook":
      return maskUrl(config.url);
  }
}

/** Identifies where a message lands, so the same place isn't sent the same
 * notification twice (a member who added the household's own chat, or
 * one webhook twice). */
export function destinationKey(config: PersonalChannelConfig, ntfyServer: string | null): string {
  switch (config.kind) {
    case "telegram":
      return `telegram:${config.chatId}`;
    case "pushover":
      return `pushover:${config.userKey}`;
    case "email":
      return `email:${config.address.toLowerCase()}`;
    case "discord":
      return `discord:${config.webhookUrl.replace("discordapp.com", "discord.com").replace(/^https:\/\/(ptb|canary)\./, "https://")}`;
    case "ntfy":
      return `ntfy:${ntfyUrlFor(config, ntfyServer) ?? config.topic ?? ""}`;
    case "webhook":
      return `webhook:${config.url}`;
  }
}

/** The pieces of each kind that the API takes, for docs and errors. */
export const CONFIG_FIELDS: Record<UserNotificationChannelKind, string[]> = {
  telegram: ["chatId"],
  pushover: ["userKey"],
  email: ["address"],
  discord: ["webhookUrl"],
  ntfy: ["topic", "url"],
  webhook: ["url"],
};
