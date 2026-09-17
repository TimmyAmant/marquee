"use server";

import { clearDiscordWebhookUrl } from "@/lib/integrations/app-settings";
import { clearIntegrationSetting, testAndSaveDiscordWebhook as testAndSave } from "@/lib/integrations/manage";
import { requireAdmin } from "@/lib/auth/require-admin";

export type DiscordSettingsState = { error?: string; success?: boolean };

export async function testAndSaveDiscordWebhook(
  _prevState: DiscordSettingsState | undefined,
  formData: FormData,
): Promise<DiscordSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const result = await testAndSave(String(formData.get("webhookUrl") || ""));
  return result.ok ? { success: true } : { error: result.error };
}

export async function disconnectDiscord(
  _prevState: DiscordSettingsState | undefined,
): Promise<DiscordSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  await clearIntegrationSetting(clearDiscordWebhookUrl);
  return { success: true };
}
