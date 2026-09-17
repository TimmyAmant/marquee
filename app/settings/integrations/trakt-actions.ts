"use server";

import { clearTraktClientId } from "@/lib/integrations/app-settings";
import { clearIntegrationSetting, testAndSaveTraktClientId as testAndSave } from "@/lib/integrations/manage";
import { importTraktList } from "@/lib/integrations/trakt-import";
import { requireAdmin } from "@/lib/auth/require-admin";

export type TraktSettingsState = { error?: string; success?: boolean };

export async function testAndSaveTraktClientId(
  _prevState: TraktSettingsState | undefined,
  formData: FormData,
): Promise<TraktSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const result = await testAndSave(String(formData.get("clientId") || ""));
  return result.ok ? { success: true } : { error: result.error };
}

export async function disconnectTrakt(
  _prevState: TraktSettingsState | undefined,
): Promise<TraktSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  await clearIntegrationSetting(clearTraktClientId);
  return { success: true };
}

export type TraktImportState = {
  error?: string;
  success?: boolean;
  importedCount?: number;
  skippedCount?: number;
};

/** Imports a public Trakt list or watchlist as pending requests — see importTraktList. */
export async function importTraktListAction(
  _prevState: TraktImportState | undefined,
  formData: FormData,
): Promise<TraktImportState> {
  const admin = await requireAdmin("Only the admin can import from Trakt.");
  if (!admin.ok) return { error: admin.error };

  const result = await importTraktList(admin.userId, String(formData.get("url") || ""));
  if (!result.ok) return { error: result.error };
  return { success: true, importedCount: result.importedCount, skippedCount: result.skippedCount };
}
