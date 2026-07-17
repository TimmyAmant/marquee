"use server";

import { revalidatePath } from "next/cache";
import { updateArrDefaults, upsertArrCredential, regenerateWebhookSecret } from "@/lib/integrations/credentials";
import { requireAdmin } from "@/lib/auth/require-admin";
import * as sonarr from "@/lib/sonarr/client";
import * as radarr from "@/lib/radarr/client";
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

function clientFor(provider: ArrProvider) {
  return provider === "sonarr" ? sonarr : radarr;
}

export async function testAndSaveArrConnection(
  provider: ArrProvider,
  _prevState: ArrConnectionState | undefined,
  formData: FormData,
): Promise<ArrConnectionState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };
  if (!isArrProvider(provider)) return { error: "Invalid provider." };

  const baseUrl = String(formData.get("baseUrl") || "").trim().replace(/\/+$/, "");
  const apiKey = String(formData.get("apiKey") || "").trim();
  if (!baseUrl || !apiKey) {
    return { error: "URL and API key are required." };
  }

  const client = clientFor(provider);

  try {
    await client.testConnection({ baseUrl, apiKey });
  } catch {
    return { error: "Couldn't connect. Check the URL and API key and try again." };
  }

  const [rootFolders, qualityProfiles] = await Promise.all([
    client.getRootFolders({ baseUrl, apiKey }),
    client.getQualityProfiles({ baseUrl, apiKey }),
  ]);

  const selectedRootFolder = rootFolders[0]?.path ?? null;
  const selectedQualityProfileId = qualityProfiles[0]?.id ?? null;

  await upsertArrCredential(admin.userId, provider, {
    baseUrl,
    apiKey,
    qualityProfileId: selectedQualityProfileId,
    rootFolderPath: selectedRootFolder,
  });

  revalidatePath("/settings/integrations");

  return {
    success: true,
    baseUrl,
    rootFolders,
    qualityProfiles,
    selectedRootFolder,
    selectedQualityProfileId,
  };
}

export async function saveArrDefaults(provider: ArrProvider, formData: FormData) {
  const admin = await requireAdmin();
  if (!admin.ok) return;
  if (!isArrProvider(provider)) return;

  const rootFolderPath = String(formData.get("rootFolderPath") || "");
  const qualityProfileId = Number(formData.get("qualityProfileId"));
  if (!rootFolderPath || !Number.isFinite(qualityProfileId)) return;

  await updateArrDefaults(admin.userId, provider, { rootFolderPath, qualityProfileId });
  revalidatePath("/settings/integrations");
}

export type RegenerateWebhookSecretState = { secret?: string; error?: string };

export async function regenerateWebhookSecretAction(): Promise<RegenerateWebhookSecretState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const secret = await regenerateWebhookSecret(admin.userId);
  revalidatePath("/settings/integrations");
  return { secret };
}

