"use server";

import { revalidatePath } from "next/cache";
import { upsertJellyfinCredential } from "@/lib/integrations/credentials";
import { requireAdmin } from "@/lib/auth/require-admin";
import * as jellyfin from "@/lib/jellyfin/client";

export type JellyfinConnectionState = { error?: string; success?: boolean };

export async function testAndSaveJellyfinConnection(
  _prevState: JellyfinConnectionState | undefined,
  formData: FormData,
): Promise<JellyfinConnectionState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const baseUrl = String(formData.get("baseUrl") || "").trim().replace(/\/+$/, "");
  const apiKey = String(formData.get("apiKey") || "").trim();
  if (!baseUrl || !apiKey) {
    return { error: "URL and API key are required." };
  }

  try {
    await jellyfin.testConnection({ baseUrl, apiKey });
  } catch {
    return { error: "Couldn't connect. Check the URL and API key and try again." };
  }

  await upsertJellyfinCredential(admin.userId, { baseUrl, apiKey });

  revalidatePath("/settings/integrations");
  return { success: true };
}
