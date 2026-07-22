"use server";

import { revalidatePath } from "next/cache";
import { verifyWebhookUrl } from "@/lib/webhook/client";
import { setGenericWebhookUrl, clearGenericWebhookUrl } from "@/lib/integrations/app-settings";
import { requireAdmin } from "@/lib/auth/require-admin";

export type WebhookSettingsState = { error?: string; success?: boolean };

export async function testAndSaveGenericWebhook(
  _prevState: WebhookSettingsState | undefined,
  formData: FormData,
): Promise<WebhookSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const webhookUrl = String(formData.get("webhookUrl") || "").trim();
  if (!webhookUrl) return { error: "Enter a webhook URL." };
  if (!webhookUrl.startsWith("http://") && !webhookUrl.startsWith("https://")) {
    return { error: "Enter a valid URL, starting with http:// or https://." };
  }

  const valid = await verifyWebhookUrl(webhookUrl);
  if (!valid) return { error: "Couldn't post a test request to that URL. Check it and try again." };

  await setGenericWebhookUrl(webhookUrl);
  revalidatePath("/settings/integrations");
  return { success: true };
}

export async function disconnectGenericWebhook(
  _prevState: WebhookSettingsState | undefined,
): Promise<WebhookSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  await clearGenericWebhookUrl();
  revalidatePath("/settings/integrations");
  return { success: true };
}
