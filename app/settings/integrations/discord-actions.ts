"use server";

import { revalidatePath } from "next/cache";
import { verifyDiscordWebhook } from "@/lib/discord/client";
import { setDiscordWebhookUrl, clearDiscordWebhookUrl } from "@/lib/integrations/app-settings";
import { requireAdmin } from "@/lib/auth/require-admin";

export type DiscordSettingsState = { error?: string; success?: boolean };

export async function testAndSaveDiscordWebhook(
  _prevState: DiscordSettingsState | undefined,
  formData: FormData,
): Promise<DiscordSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const webhookUrl = String(formData.get("webhookUrl") || "").trim();
  if (!webhookUrl) return { error: "Enter a Discord webhook URL." };
  if (!webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
    return { error: "That doesn't look like a Discord webhook URL." };
  }

  const valid = await verifyDiscordWebhook(webhookUrl);
  if (!valid) return { error: "Couldn't post a test message to that webhook. Check it and try again." };

  await setDiscordWebhookUrl(webhookUrl);
  revalidatePath("/settings/integrations");
  return { success: true };
}

export async function disconnectDiscord(
  _prevState: DiscordSettingsState | undefined,
): Promise<DiscordSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  await clearDiscordWebhookUrl();
  revalidatePath("/settings/integrations");
  return { success: true };
}
