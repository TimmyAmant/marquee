"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { verifyTmdbAccessToken } from "@/lib/tmdb/client";
import { setTmdbAccessToken, clearTmdbAccessToken } from "@/lib/integrations/app-settings";

export type TmdbSettingsState = { error?: string; success?: boolean };

export async function testAndSaveTmdbToken(
  _prevState: TmdbSettingsState | undefined,
  formData: FormData,
): Promise<TmdbSettingsState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };
  if (session.user.role !== "admin") return { error: "Only the admin can manage integrations." };

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
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };
  if (session.user.role !== "admin") return { error: "Only the admin can manage integrations." };

  await clearTmdbAccessToken();
  revalidatePath("/settings/integrations");
  return { success: true };
}
