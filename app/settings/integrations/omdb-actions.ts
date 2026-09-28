"use server";

import { clearOmdbApiKey } from "@/lib/integrations/app-settings";
import { clearIntegrationSetting, testAndSaveOmdbApiKey as testAndSave } from "@/lib/integrations/manage";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getT } from "@/lib/i18n/server";

export type OmdbSettingsState = { error?: string; success?: boolean; tested?: boolean };

export async function testAndSaveOmdbApiKey(
  _prevState: OmdbSettingsState | undefined,
  formData: FormData,
): Promise<OmdbSettingsState> {
  const admin = await requireAdmin((await getT())("integrations.adminOnly"));
  if (!admin.ok) return { error: admin.error };

  // "Test" checks without saving; Save tests, then saves.
  const dryRun = formData.get("intent") === "test";
  const result = await testAndSave(String(formData.get("apiKey") || ""), { dryRun });
  if (!result.ok) return { error: result.error };
  return dryRun ? { tested: true } : { success: true };
}

export async function disconnectOmdb(_prevState: OmdbSettingsState | undefined): Promise<OmdbSettingsState> {
  const admin = await requireAdmin((await getT())("integrations.adminOnly"));
  if (!admin.ok) return { error: admin.error };

  await clearIntegrationSetting(clearOmdbApiKey);
  return { success: true };
}
