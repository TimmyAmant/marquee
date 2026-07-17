"use server";

import { revalidatePath } from "next/cache";
import { verifyTmdbAccessToken } from "@/lib/tmdb/client";
import { setTmdbAccessToken, clearTmdbAccessToken } from "@/lib/integrations/app-settings";
import { requireAdmin } from "@/lib/auth/require-admin";

export type TmdbSettingsState = { error?: string; success?: boolean };

export async function testAndSaveTmdbToken(
  _prevState: TmdbSettingsState | undefined,
  formData: FormData,
): Promise<TmdbSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const token = String(formData.get("accessToken") || "").trim();
  if (!token) return { error: "Enter an access token." };

  const valid = await verifyTmdbAccessToken(token).catch(() => false);
  if (!valid) return { error: "Couldn't verify this token with TMDb. Check it and try again." };

  await setTmdbAccessToken(token);
  revalidatePath("/settings/integrations");
  return { success: true };
}

export async function disconnectTmdb(
  _prevState: TmdbSettingsState | undefined,
): Promise<TmdbSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  await clearTmdbAccessToken();
  revalidatePath("/settings/integrations");
  return { success: true };
}
