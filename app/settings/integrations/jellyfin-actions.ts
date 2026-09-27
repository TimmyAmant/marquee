"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { testAndSaveJellyfinConnection as testAndSave } from "@/lib/integrations/manage";
import { getT } from "@/lib/i18n/server";

export type JellyfinConnectionState = { error?: string; success?: boolean };

export async function testAndSaveJellyfinConnection(
  _prevState: JellyfinConnectionState | undefined,
  formData: FormData,
): Promise<JellyfinConnectionState> {
  const admin = await requireAdmin((await getT())("integrations.adminOnly"));
  if (!admin.ok) return { error: admin.error };

  const result = await testAndSave(admin.userId, {
    baseUrl: String(formData.get("baseUrl") || ""),
    apiKey: String(formData.get("apiKey") || ""),
    publicUrl: String(formData.get("publicUrl") || "") || null,
  });
  return result.ok ? { success: true } : { error: result.error };
}
