"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { revalidateIntegrations } from "@/lib/integrations/manage";
import {
  clearChannel,
  testAndSaveEmail,
  testAndSaveGotify,
  testAndSavePushbullet,
  testAndSavePushover,
  testAndSaveSlack,
  testAndSaveTelegram,
} from "@/lib/notifications/channels";
import { notificationChannelKindValues } from "@/lib/db/schema";
import type { NotificationChannelKind } from "@/lib/db/schema";
import { getT } from "@/lib/i18n/server";

// Settings › Notifications: Telegram, Pushover, email, Gotify, Slack and
// Pushbullet —
// the same test-and-save as PUT /api/v1/settings/integrations/{kind}.

/** `values`: what was typed, handed back after a failed test so the form
 * (which React resets after every submission) can show it again. */
export type ChannelState = {
  error?: string;
  success?: boolean;
  tested?: boolean;
  removed?: boolean;
  values?: Record<string, string>;
};

const SAVE: Record<NotificationChannelKind, (input: Record<string, string>, options: { dryRun?: boolean }) => ReturnType<typeof testAndSaveEmail>> = {
  telegram: testAndSaveTelegram,
  pushover: testAndSavePushover,
  email: testAndSaveEmail,
  gotify: testAndSaveGotify,
  slack: testAndSaveSlack,
  pushbullet: testAndSavePushbullet,
};

function isKind(value: unknown): value is NotificationChannelKind {
  return typeof value === "string" && (notificationChannelKindValues as readonly string[]).includes(value);
}

export async function saveChannelAction(_prev: ChannelState | undefined, formData: FormData): Promise<ChannelState> {
  const admin = await requireAdmin((await getT())("integrations.adminOnly"));
  if (!admin.ok) return { error: admin.error };
  const kind = formData.get("kind");
  if (!isKind(kind)) return { error: (await getT())("integrations.unknownChannel") };
  const fields = Object.fromEntries(
    [...formData.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  // "Test" sends the test message without saving; Save tests, then saves.
  const dryRun = fields.intent === "test";
  const result = await SAVE[kind](fields, { dryRun });
  if (!result.ok) return { error: result.error, values: fields };
  if (dryRun) return { tested: true, values: fields };
  revalidateIntegrations();
  return { success: true };
}

export async function removeChannelAction(_prev: ChannelState | undefined, formData: FormData): Promise<ChannelState> {
  const admin = await requireAdmin((await getT())("integrations.adminOnly"));
  if (!admin.ok) return { error: admin.error };
  const kind = formData.get("kind");
  if (!isKind(kind)) return { error: (await getT())("integrations.unknownChannel") };
  await clearChannel(kind);
  revalidateIntegrations();
  return { removed: true };
}
