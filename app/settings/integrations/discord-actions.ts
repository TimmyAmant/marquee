"use server";

import { clearDiscordWebhookUrl } from "@/lib/integrations/app-settings";
import { clearIntegrationSetting, testAndSaveDiscordWebhook as testAndSave } from "@/lib/integrations/manage";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getT } from "@/lib/i18n/server";

export type DiscordSettingsState = { error?: string; success?: boolean; tested?: boolean };

export async function testAndSaveDiscordWebhook(
  _prevState: DiscordSettingsState | undefined,
  formData: FormData,
): Promise<DiscordSettingsState> {
  const admin = await requireAdmin((await getT())("integrations.adminOnly"));
  if (!admin.ok) return { error: admin.error };

  // "Test" checks without saving; Save tests, then saves.
  const dryRun = formData.get("intent") === "test";
  const result = await testAndSave(String(formData.get("webhookUrl") || ""), { dryRun });
  if (!result.ok) return { error: result.error };
  return dryRun ? { tested: true } : { success: true };
}

export async function disconnectDiscord(
  _prevState: DiscordSettingsState | undefined,
): Promise<DiscordSettingsState> {
  const admin = await requireAdmin((await getT())("integrations.adminOnly"));
  if (!admin.ok) return { error: admin.error };

  await clearIntegrationSetting(clearDiscordWebhookUrl);
  return { success: true };
}
