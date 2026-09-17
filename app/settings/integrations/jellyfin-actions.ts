"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { testAndSaveJellyfinConnection as testAndSave } from "@/lib/integrations/manage";

export type JellyfinConnectionState = { error?: string; success?: boolean };

export async function testAndSaveJellyfinConnection(
  _prevState: JellyfinConnectionState | undefined,
  formData: FormData,
): Promise<JellyfinConnectionState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const result = await testAndSave(admin.userId, {
    baseUrl: String(formData.get("baseUrl") || ""),
    apiKey: String(formData.get("apiKey") || ""),
  });
  return result.ok ? { success: true } : { error: result.error };
}
