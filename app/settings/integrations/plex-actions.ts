"use server";

import { revalidatePath } from "next/cache";
import { getOrCreatePlexClientId, upsertPlexCredential } from "@/lib/integrations/credentials";
import { requireAdmin } from "@/lib/auth/require-admin";
import * as plex from "@/lib/plex/client";
import { syncPlexLibrary, getPlexSummary } from "@/lib/plex/sync";

export type StartPlexAuthResult = { error?: string; authUrl?: string; pinId?: number };

export async function startPlexAuth(): Promise<StartPlexAuthResult> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const clientId = await getOrCreatePlexClientId(admin.userId);

  try {
    const pin = await plex.createPin(clientId);
    return { authUrl: plex.buildPlexAuthUrl(clientId, pin.code), pinId: pin.id };
  } catch {
    return { error: "Couldn't start Plex sign-in. Try again." };
  }
}

export type PlexAuthStatus = {
  connected: boolean;
  error?: string;
  movieCount?: number;
  tvCount?: number;
};

export async function checkPlexAuthStatus(pinId: number): Promise<PlexAuthStatus> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { connected: false, error: admin.error };

  const clientId = await getOrCreatePlexClientId(admin.userId);

  const pin = await plex.checkPin(clientId, pinId).catch(() => null);
  if (!pin?.authToken) return { connected: false };

  await upsertPlexCredential(admin.userId, { authToken: pin.authToken, clientId });
  await syncPlexLibrary(admin.userId).catch(() => undefined);

  const summary = await getPlexSummary(admin.userId);

  revalidatePath("/settings/integrations");

  return {
    connected: true,
    movieCount: summary.movieCount,
    tvCount: summary.tvCount,
  };
}
