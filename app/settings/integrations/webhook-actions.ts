"use server";

import { clearGenericWebhookUrl } from "@/lib/integrations/app-settings";
import { clearIntegrationSetting, testAndSaveGenericWebhookUrl } from "@/lib/integrations/manage";
import { requireAdmin } from "@/lib/auth/require-admin";

export type WebhookSettingsState = { error?: string; success?: boolean };

export async function testAndSaveGenericWebhook(
  _prevState: WebhookSettingsState | undefined,
  formData: FormData,
): Promise<WebhookSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const result = await testAndSaveGenericWebhookUrl(String(formData.get("webhookUrl") || ""));
  return result.ok ? { success: true } : { error: result.error };
}

export async function disconnectGenericWebhook(
  _prevState: WebhookSettingsState | undefined,
): Promise<WebhookSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  await clearIntegrationSetting(clearGenericWebhookUrl);
  return { success: true };
}
