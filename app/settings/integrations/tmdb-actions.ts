"use server";

import { clearTmdbAccessToken } from "@/lib/integrations/app-settings";
import { clearIntegrationSetting, testAndSaveTmdbToken as testAndSave } from "@/lib/integrations/manage";
import { requireAdmin } from "@/lib/auth/require-admin";

export type TmdbSettingsState = { error?: string; success?: boolean };

export async function testAndSaveTmdbToken(
  _prevState: TmdbSettingsState | undefined,
  formData: FormData,
): Promise<TmdbSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const result = await testAndSave(String(formData.get("accessToken") || ""));
  return result.ok ? { success: true } : { error: result.error };
}

export async function disconnectTmdb(
  _prevState: TmdbSettingsState | undefined,
): Promise<TmdbSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  await clearIntegrationSetting(clearTmdbAccessToken);
  return { success: true };
}
