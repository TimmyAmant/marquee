"use server";

import { revalidatePath } from "next/cache";
import { regenerateWebhookSecret } from "@/lib/integrations/credentials";
import { requireAdmin } from "@/lib/auth/require-admin";
import { saveArrDefaultsFor, testAndSaveArrConnection as testAndSaveArr } from "@/lib/integrations/manage";
import { arrProviderValues, type ArrProvider } from "@/lib/db/schema";

function isArrProvider(value: unknown): value is ArrProvider {
  return typeof value === "string" && (arrProviderValues as readonly string[]).includes(value);
}

export type ArrConnectionState = {
  error?: string;
  success?: boolean;
  baseUrl?: string;
  rootFolders?: { id: number; path: string }[];
  qualityProfiles?: { id: number; name: string }[];
  selectedRootFolder?: string | null;
  selectedQualityProfileId?: number | null;
};

export async function testAndSaveArrConnection(
  provider: ArrProvider,
  _prevState: ArrConnectionState | undefined,
  formData: FormData,
): Promise<ArrConnectionState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };
  if (!isArrProvider(provider)) return { error: "Invalid provider." };

  const result = await testAndSaveArr(admin.userId, provider, {
    baseUrl: String(formData.get("baseUrl") || ""),
    apiKey: String(formData.get("apiKey") || ""),
  });
  if (!result.ok) return { error: result.error };

  return {
    success: true,
    baseUrl: result.baseUrl,
    rootFolders: result.rootFolders,
    qualityProfiles: result.qualityProfiles,
    selectedRootFolder: result.selectedRootFolder,
    selectedQualityProfileId: result.selectedQualityProfileId,
  };
}

export async function saveArrDefaults(provider: ArrProvider, formData: FormData) {
  const admin = await requireAdmin();
  if (!admin.ok) return;
  if (!isArrProvider(provider)) return;

  await saveArrDefaultsFor(admin.userId, provider, {
    rootFolderPath: String(formData.get("rootFolderPath") || ""),
    qualityProfileId: Number(formData.get("qualityProfileId")),
  });
}

export type RegenerateWebhookSecretState = { secret?: string; error?: string };

export async function regenerateWebhookSecretAction(): Promise<RegenerateWebhookSecretState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const secret = await regenerateWebhookSecret(admin.userId);
  revalidatePath("/settings/integrations");
  return { secret };
}
