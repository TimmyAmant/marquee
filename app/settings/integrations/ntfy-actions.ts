"use server";

import { clearNtfyUrl } from "@/lib/integrations/app-settings";
import { clearIntegrationSetting, testAndSaveNtfyTopic } from "@/lib/integrations/manage";
import { requireAdmin } from "@/lib/auth/require-admin";

export type NtfySettingsState = { error?: string; success?: boolean };

export async function testAndSaveNtfy(
  _prevState: NtfySettingsState | undefined,
  formData: FormData,
): Promise<NtfySettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const result = await testAndSaveNtfyTopic(String(formData.get("topicUrl") || ""));
  return result.ok ? { success: true } : { error: result.error };
}

export async function disconnectNtfy(
  _prevState: NtfySettingsState | undefined,
): Promise<NtfySettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  await clearIntegrationSetting(clearNtfyUrl);
  return { success: true };
}
