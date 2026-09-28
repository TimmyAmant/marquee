"use server";

import { clearGenericWebhookUrl } from "@/lib/integrations/app-settings";
import { clearIntegrationSetting, testAndSaveGenericWebhookUrl } from "@/lib/integrations/manage";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getT } from "@/lib/i18n/server";

export type WebhookSettingsState = { error?: string; success?: boolean; tested?: boolean };

export async function testAndSaveGenericWebhook(
  _prevState: WebhookSettingsState | undefined,
  formData: FormData,
): Promise<WebhookSettingsState> {
  const admin = await requireAdmin((await getT())("integrations.adminOnly"));
  if (!admin.ok) return { error: admin.error };

  // "Test" checks without saving; Save tests, then saves.
  const dryRun = formData.get("intent") === "test";
  const result = await testAndSaveGenericWebhookUrl(String(formData.get("webhookUrl") || ""), { dryRun });
  if (!result.ok) return { error: result.error };
  return dryRun ? { tested: true } : { success: true };
}

export async function disconnectGenericWebhook(
  _prevState: WebhookSettingsState | undefined,
): Promise<WebhookSettingsState> {
  const admin = await requireAdmin((await getT())("integrations.adminOnly"));
  if (!admin.ok) return { error: admin.error };

  await clearIntegrationSetting(clearGenericWebhookUrl);
  return { success: true };
}
