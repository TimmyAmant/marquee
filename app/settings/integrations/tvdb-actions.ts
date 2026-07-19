"use server";

import { revalidatePath } from "next/cache";
import { verifyTvdbApiKey } from "@/lib/tvdb/client";
import { setTvdbApiKey, clearTvdbApiKey } from "@/lib/integrations/app-settings";
import { requireAdmin } from "@/lib/auth/require-admin";

export type TvdbSettingsState = { error?: string; success?: boolean };

export async function testAndSaveTvdbApiKey(
  _prevState: TvdbSettingsState | undefined,
  formData: FormData,
): Promise<TvdbSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const apiKey = String(formData.get("apiKey") || "").trim();
  if (!apiKey) return { error: "Enter a TheTVDB API key." };

  const valid = await verifyTvdbApiKey(apiKey).catch(() => false);
  if (!valid) return { error: "Couldn't verify this key with TheTVDB. Check it and try again." };

  await setTvdbApiKey(apiKey);
  revalidatePath("/settings/integrations");
  return { success: true };
}

export async function disconnectTvdb(
  _prevState: TvdbSettingsState | undefined,
): Promise<TvdbSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  await clearTvdbApiKey();
  revalidatePath("/settings/integrations");
  return { success: true };
}
