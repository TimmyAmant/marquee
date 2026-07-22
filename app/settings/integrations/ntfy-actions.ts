"use server";

import { revalidatePath } from "next/cache";
import { verifyNtfyUrl } from "@/lib/ntfy/client";
import { setNtfyUrl, clearNtfyUrl } from "@/lib/integrations/app-settings";
import { requireAdmin } from "@/lib/auth/require-admin";

export type NtfySettingsState = { error?: string; success?: boolean };

export async function testAndSaveNtfy(
  _prevState: NtfySettingsState | undefined,
  formData: FormData,
): Promise<NtfySettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const topicUrl = String(formData.get("topicUrl") || "").trim();
  if (!topicUrl) return { error: "Enter your ntfy topic URL." };
  if (!topicUrl.startsWith("http://") && !topicUrl.startsWith("https://")) {
    return { error: "Enter a full URL, e.g. https://ntfy.sh/your-topic-name." };
  }

  const valid = await verifyNtfyUrl(topicUrl);
  if (!valid) return { error: "Couldn't post a test message to that topic. Check it and try again." };

  await setNtfyUrl(topicUrl);
  revalidatePath("/settings/integrations");
  return { success: true };
}

export async function disconnectNtfy(
  _prevState: NtfySettingsState | undefined,
): Promise<NtfySettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  await clearNtfyUrl();
  revalidatePath("/settings/integrations");
  return { success: true };
}
