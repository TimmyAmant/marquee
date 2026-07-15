"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getArrCredential, updateArrDefaults, upsertArrCredential } from "@/lib/integrations/credentials";
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
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };
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

  await upsertArrCredential(session.user.id, provider, {
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
  const session = await auth();
  if (!session?.user) return;
  if (!isArrProvider(provider)) return;

  const rootFolderPath = String(formData.get("rootFolderPath") || "");
  const qualityProfileId = Number(formData.get("qualityProfileId"));
  if (!rootFolderPath || !Number.isFinite(qualityProfileId)) return;

  await updateArrDefaults(session.user.id, provider, { rootFolderPath, qualityProfileId });
  revalidatePath("/settings/integrations");
}

export async function getExistingArrCredential(provider: ArrProvider) {
  const session = await auth();
  if (!session?.user) return null;
  if (!isArrProvider(provider)) return null;
  return getArrCredential(session.user.id, provider);
}
