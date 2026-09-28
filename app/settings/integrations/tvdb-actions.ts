"use server";

import { clearTvdbApiKey } from "@/lib/integrations/app-settings";
import { clearIntegrationSetting, testAndSaveTvdbApiKey as testAndSave } from "@/lib/integrations/manage";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getT } from "@/lib/i18n/server";

export type TvdbSettingsState = { error?: string; success?: boolean; tested?: boolean };

export async function testAndSaveTvdbApiKey(
  _prevState: TvdbSettingsState | undefined,
  formData: FormData,
): Promise<TvdbSettingsState> {
  const admin = await requireAdmin((await getT())("integrations.adminOnly"));
  if (!admin.ok) return { error: admin.error };

  // "Test" checks without saving; Save tests, then saves.
  const dryRun = formData.get("intent") === "test";
  const result = await testAndSave(String(formData.get("apiKey") || ""), { dryRun });
  if (!result.ok) return { error: result.error };
  return dryRun ? { tested: true } : { success: true };
}

export async function disconnectTvdb(
  _prevState: TvdbSettingsState | undefined,
): Promise<TvdbSettingsState> {
  const admin = await requireAdmin((await getT())("integrations.adminOnly"));
  if (!admin.ok) return { error: admin.error };

  await clearIntegrationSetting(clearTvdbApiKey);
  return { success: true };
}
