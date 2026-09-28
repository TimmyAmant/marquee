"use server";

import { clearTmdbAccessToken } from "@/lib/integrations/app-settings";
import { clearIntegrationSetting, testAndSaveTmdbToken as testAndSave } from "@/lib/integrations/manage";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getT } from "@/lib/i18n/server";

export type TmdbSettingsState = { error?: string; success?: boolean; tested?: boolean };

export async function testAndSaveTmdbToken(
  _prevState: TmdbSettingsState | undefined,
  formData: FormData,
): Promise<TmdbSettingsState> {
  const admin = await requireAdmin((await getT())("integrations.adminOnly"));
  if (!admin.ok) return { error: admin.error };

  // "Test" checks without saving; Save tests, then saves.
  const dryRun = formData.get("intent") === "test";
  const result = await testAndSave(String(formData.get("accessToken") || ""), { dryRun });
  if (!result.ok) return { error: result.error };
  return dryRun ? { tested: true } : { success: true };
}

export async function disconnectTmdb(
  _prevState: TmdbSettingsState | undefined,
): Promise<TmdbSettingsState> {
  const admin = await requireAdmin((await getT())("integrations.adminOnly"));
  if (!admin.ok) return { error: admin.error };

  await clearIntegrationSetting(clearTmdbAccessToken);
  return { success: true };
}
