"use server";

import { clearTvdbApiKey } from "@/lib/integrations/app-settings";
import { clearIntegrationSetting, testAndSaveTvdbApiKey as testAndSave } from "@/lib/integrations/manage";
import { requireAdmin } from "@/lib/auth/require-admin";

export type TvdbSettingsState = { error?: string; success?: boolean };

export async function testAndSaveTvdbApiKey(
  _prevState: TvdbSettingsState | undefined,
  formData: FormData,
): Promise<TvdbSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const result = await testAndSave(String(formData.get("apiKey") || ""));
  return result.ok ? { success: true } : { error: result.error };
}

export async function disconnectTvdb(
  _prevState: TvdbSettingsState | undefined,
): Promise<TvdbSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  await clearIntegrationSetting(clearTvdbApiKey);
  return { success: true };
}
