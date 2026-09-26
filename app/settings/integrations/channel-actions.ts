"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { revalidateIntegrations } from "@/lib/integrations/manage";
import {
  clearChannel,
  testAndSaveEmail,
  testAndSavePushover,
  testAndSaveTelegram,
} from "@/lib/notifications/channels";
import type { NotificationChannelKind } from "@/lib/db/schema";

// Settings → Integrations → Notifications: Telegram, Pushover and email —
// the same test-and-save as PUT /api/v1/settings/integrations/{kind}.

export type ChannelState = { error?: string; success?: boolean; removed?: boolean };

const SAVE = {
  telegram: testAndSaveTelegram,
  pushover: testAndSavePushover,
  email: testAndSaveEmail,
} as const;

function isKind(value: unknown): value is NotificationChannelKind {
  return value === "telegram" || value === "pushover" || value === "email";
}

export async function saveChannelAction(_prev: ChannelState | undefined, formData: FormData): Promise<ChannelState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };
  const kind = formData.get("kind");
  if (!isKind(kind)) return { error: "Unknown channel." };
  const fields = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string"));
  const result = await SAVE[kind](fields);
  if (!result.ok) return { error: result.error };
  revalidateIntegrations();
  return { success: true };
}

export async function removeChannelAction(_prev: ChannelState | undefined, formData: FormData): Promise<ChannelState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };
  const kind = formData.get("kind");
  if (!isKind(kind)) return { error: "Unknown channel." };
  await clearChannel(kind);
  revalidateIntegrations();
  return { removed: true };
}
