import type { NotificationEventType } from "@/lib/db/schema";
import { getDiscordWebhookUrl, getGenericWebhookUrl, getNtfyUrl } from "@/lib/integrations/app-settings";
import { sendDiscordMessage } from "@/lib/discord/client";
import { sendWebhookNotification } from "@/lib/webhook/client";
import { sendNtfyMessage } from "@/lib/ntfy/client";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { sendPushoverMessage } from "@/lib/pushover/client";
import { sendEmail } from "@/lib/email/client";
import { getChannelConfig } from "@/lib/notifications/channels";
import { channelWants, type NotificationPreferenceEvent } from "@/lib/notifications/events";
import { householdPostsEvent, roleOf } from "@/lib/notifications/preferences";
import { deliverableChannels, deliverToChannel, type ChannelMessage, type DeliverableChannel } from "@/lib/notifications/personal";
import { destinationKey } from "@/lib/notifications/personal-config";

// Where a notification goes past the account's own bell and devices: the
// household channels (the admin's Discord, ntfy, Telegram, Pushover, email
// and webhook, for the events the admin picked), then the account's own
// channels for the events it picked. A place that already got it from the
// household isn't sent it again, and neither is one listed twice. Nothing
// here throws, and one channel failing never stops the others.

export const EVENT_EMOJI: Record<NotificationEventType, string> = {
  grabbed: "⬇️",
  downloaded: "✅",
  request_approved: "👍",
  request_rejected: "👎",
  issue_reported: "⚠️",
  issue_resolved: "🛠️",
  request_created: "🙋",
};

export type OutgoingNotification = {
  userId: string;
  eventType: NotificationEventType;
  event: NotificationPreferenceEvent;
  title: string;
  message: string;
  mediaType: string;
  tmdbId: number;
};

/** Starts posting to every household channel that's set up and returns
 * where they're posting (destinationKey's form), without waiting for them. */
export async function relayToHousehold(input: OutgoingNotification): Promise<Set<string>> {
  const keys = new Set<string>();
  const line = `${EVENT_EMOJI[input.eventType]} ${input.message}`;
  const [discord, ntfy, webhook, telegram, pushover, email] = await Promise.all([
    getDiscordWebhookUrl().catch(() => null),
    getNtfyUrl().catch(() => null),
    getGenericWebhookUrl().catch(() => null),
    getChannelConfig("telegram").catch(() => null),
    getChannelConfig("pushover").catch(() => null),
    getChannelConfig("email").catch(() => null),
  ]);
  if (discord) {
    keys.add(destinationKey({ kind: "discord", webhookUrl: discord }, null));
    sendDiscordMessage(discord, line).catch(() => undefined);
  }
  if (ntfy) {
    keys.add(destinationKey({ kind: "ntfy", url: ntfy }, null));
    sendNtfyMessage(ntfy, input.title, input.message).catch(() => undefined);
  }
  if (telegram) {
    keys.add(destinationKey({ kind: "telegram", chatId: telegram.chatId }, null));
    sendTelegramMessage(telegram, line).catch(() => undefined);
  }
  if (pushover) {
    keys.add(destinationKey({ kind: "pushover", userKey: pushover.userKey }, null));
    sendPushoverMessage(pushover, input.title, input.message).catch(() => undefined);
  }
  if (email) {
    for (const address of email.to) keys.add(destinationKey({ kind: "email", address }, null));
    sendEmail(email, line, `${input.message}\n\n— Marquee`).catch(() => undefined);
  }
  if (webhook) {
    keys.add(destinationKey({ kind: "webhook", url: webhook }, null));
    sendWebhookNotification(webhook, { event: input.eventType, title: input.title, message: input.message }).catch(
      () => undefined,
    );
  }
  return keys;
}

/** The account's own channels that want this event, minus any place in
 * `alreadySent` and repeats among them. Pure; unit tested. */
export function personalTargets(
  channels: DeliverableChannel[],
  event: NotificationPreferenceEvent,
  alreadySent: ReadonlySet<string>,
): DeliverableChannel[] {
  const seen = new Set(alreadySent);
  const targets: DeliverableChannel[] = [];
  for (const channel of channels) {
    if (!channelWants(channel.row.events, event)) continue;
    if (seen.has(channel.key)) continue;
    seen.add(channel.key);
    targets.push(channel);
  }
  return targets;
}

/** Household relay (when `relay` and the admin picked this event), then the
 * account's own channels. Resolves once every personal send has finished. */
export async function fanOut(input: OutgoingNotification, relay: boolean): Promise<void> {
  try {
    const householdKeys = relay && (await householdPostsEvent(input.event)) ? await relayToHousehold(input) : new Set<string>();
    const channels = await deliverableChannels(input.userId);
    const targets = personalTargets(channels, input.event, householdKeys);
    if (targets.length === 0) return;
    const role = (await roleOf(input.userId)) ?? "member";
    const message: ChannelMessage = {
      line: `${EVENT_EMOJI[input.eventType]} ${input.message}`,
      heading: input.title,
      message: input.message,
      event: input.eventType,
      preference: input.event,
      mediaType: input.mediaType,
      tmdbId: input.tmdbId,
    };
    await Promise.all(targets.map((target) => deliverToChannel(target, message, { id: input.userId, role })));
  } catch (err) {
    console.error("[notifications] fan-out failed:", err);
  }
}
