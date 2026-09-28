"use server";

import { clearNtfyUrl } from "@/lib/integrations/app-settings";
import { clearIntegrationSetting, testAndSaveNtfyTopic } from "@/lib/integrations/manage";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getT } from "@/lib/i18n/server";

export type NtfySettingsState = { error?: string; success?: boolean; tested?: boolean };

export async function testAndSaveNtfy(
  _prevState: NtfySettingsState | undefined,
  formData: FormData,
): Promise<NtfySettingsState> {
  const admin = await requireAdmin((await getT())("integrations.adminOnly"));
  if (!admin.ok) return { error: admin.error };

  // "Test" checks without saving; Save tests, then saves.
  const dryRun = formData.get("intent") === "test";
  const result = await testAndSaveNtfyTopic(String(formData.get("topicUrl") || ""), { dryRun });
  if (!result.ok) return { error: result.error };
  return dryRun ? { tested: true } : { success: true };
}

export async function disconnectNtfy(
  _prevState: NtfySettingsState | undefined,
): Promise<NtfySettingsState> {
  const admin = await requireAdmin((await getT())("integrations.adminOnly"));
  if (!admin.ok) return { error: admin.error };

  await clearIntegrationSetting(clearNtfyUrl);
  return { success: true };
}
