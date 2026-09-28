import { englishT } from "@/lib/i18n/catalog";
import type { Translator } from "@/lib/i18n/translator";
import { outboundUrlError, postOutbound, type OutboundPolicy, type OutboundResult } from "@/lib/notifications/outbound";

// Gotify, Slack and Pushbullet (Seerr has all three): what each needs, the
// checks on what was typed, and the one request that posts a message. Used
// by the household channels (lib/notifications/channels.ts) and members'
// own (personal.ts). Everything goes through postOutbound, so a member's
// address can't reach the home network. Pure apart from the sending;
// unit tested.

export type GotifyConfig = { url: string; appToken: string; priority: number };
/** An incoming webhook: Slack's, or anything that takes Slack's format
 * (Mattermost, Rocket.Chat). */
export type SlackConfig = { webhookUrl: string };
/** `channelTag`: post to one of your Pushbullet channels instead of your devices. */
export type PushbulletConfig = { accessToken: string; channelTag: string | null };

const GOTIFY_TOKEN = /^[A-Za-z0-9._-]{8,128}$/;
const PUSHBULLET_TOKEN = /^[A-Za-z0-9._-]{20,128}$/;
const PUSHBULLET_TAG = /^[A-Za-z0-9_-]{1,64}$/;
const PUSHBULLET_URL = "https://api.pushbullet.com/v2/pushes";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export type Parsed<T> = { ok: true; config: T } | { ok: false; error: string };

/** A Gotify server's address and an application token made on it. A blank
 * token keeps `saved`'s (for the same server). */
export function parseGotify(
  input: Record<string, unknown>,
  saved: GotifyConfig | null,
  policy: OutboundPolicy,
  t: Translator = englishT(),
): Parsed<GotifyConfig> {
  const url = text(input.url).replace(/\/+$/, "");
  if (!url) return { ok: false, error: t("notify.gotifyEnterUrl") };
  const invalid = outboundUrlError(url, policy, t);
  if (invalid) return { ok: false, error: invalid };
  const appToken = text(input.appToken) || (saved && saved.url === url ? saved.appToken : "");
  if (!GOTIFY_TOKEN.test(appToken)) return { ok: false, error: t("notify.gotifyEnterToken") };
  const rawPriority = input.priority === undefined || input.priority === "" || input.priority === null ? 5 : Number(input.priority);
  if (!Number.isInteger(rawPriority) || rawPriority < 0 || rawPriority > 10) {
    return { ok: false, error: t("notify.gotifyPriority") };
  }
  return { ok: true, config: { url, appToken, priority: rawPriority } };
}

export function parseSlack(
  input: Record<string, unknown>,
  saved: SlackConfig | null,
  policy: OutboundPolicy,
  t: Translator = englishT(),
): Parsed<SlackConfig> {
  const webhookUrl = text(input.webhookUrl) || saved?.webhookUrl || "";
  if (!webhookUrl) return { ok: false, error: t("notify.slackEnterUrl") };
  const invalid = outboundUrlError(webhookUrl, policy, t);
  if (invalid) return { ok: false, error: invalid };
  return { ok: true, config: { webhookUrl } };
}

export function parsePushbullet(
  input: Record<string, unknown>,
  saved: PushbulletConfig | null,
  t: Translator = englishT(),
): Parsed<PushbulletConfig> {
  const accessToken = text(input.accessToken) || saved?.accessToken || "";
  if (!PUSHBULLET_TOKEN.test(accessToken)) return { ok: false, error: t("notify.pushbulletEnterToken") };
  const channelTag = text(input.channelTag) || null;
  if (channelTag && !PUSHBULLET_TAG.test(channelTag)) return { ok: false, error: t("notify.pushbulletBadChannel") };
  return { ok: true, config: { accessToken, channelTag } };
}

export type OutgoingRequest = { url: string; headers: Record<string, string>; body: string };

export function gotifyRequest(config: GotifyConfig, title: string, message: string): OutgoingRequest {
  return {
    url: `${config.url}/message`,
    headers: { "Content-Type": "application/json", "X-Gotify-Key": config.appToken },
    body: JSON.stringify({ title, message, priority: config.priority }),
  };
}

export function slackRequest(config: SlackConfig, line: string): OutgoingRequest {
  return {
    url: config.webhookUrl,
    headers: { "Content-Type": "application/json" },
    // Plain text, no @here/@channel from a title's name.
    body: JSON.stringify({ text: line.replace(/<!(here|channel|everyone)>/gi, ""), unfurl_links: false }),
  };
}

export function pushbulletRequest(config: PushbulletConfig, title: string, message: string): OutgoingRequest {
  return {
    url: PUSHBULLET_URL,
    headers: { "Content-Type": "application/json", "Access-Token": config.accessToken },
    body: JSON.stringify({
      type: "note",
      title,
      body: message,
      ...(config.channelTag ? { channel_tag: config.channelTag } : {}),
    }),
  };
}

export function send(request: OutgoingRequest, policy: OutboundPolicy, t: Translator = englishT()): Promise<OutboundResult> {
  return postOutbound(request.url, { headers: request.headers, body: request.body }, policy, t);
}

/** Masked, for Settings. */
export function maskedService(kind: "gotify" | "slack" | "pushbullet", config: GotifyConfig | SlackConfig | PushbulletConfig): string {
  const host = (raw: string) => {
    try {
      return new URL(raw).host;
    } catch {
      return "";
    }
  };
  if (kind === "gotify") return `${host((config as GotifyConfig).url)} · ••••`;
  if (kind === "slack") return `${host((config as SlackConfig).webhookUrl)}/••••`;
  const tag = (config as PushbulletConfig).channelTag;
  return tag ? `Pushbullet #${tag}` : `Pushbullet ••••${(config as PushbulletConfig).accessToken.slice(-4)}`;
}
