"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getOrCreatePlexClientId, upsertPlexCredential } from "@/lib/integrations/credentials";
import * as plex from "@/lib/plex/client";
import { syncPlexLibrary, getPlexSummary } from "@/lib/plex/sync";

export type StartPlexAuthResult = { error?: string; authUrl?: string; pinId?: number };

export async function startPlexAuth(): Promise<StartPlexAuthResult> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const clientId = await getOrCreatePlexClientId(session.user.id);

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
  const session = await auth();
  if (!session?.user) return { connected: false, error: "You must be signed in." };

  const clientId = await getOrCreatePlexClientId(session.user.id);

  const pin = await plex.checkPin(clientId, pinId).catch(() => null);
  if (!pin?.authToken) return { connected: false };

  await upsertPlexCredential(session.user.id, { authToken: pin.authToken, clientId });
  await syncPlexLibrary(session.user.id).catch(() => undefined);

  const summary = await getPlexSummary(session.user.id);

  revalidatePath("/settings/integrations");

  return {
    connected: true,
    movieCount: summary.movieCount,
    tvCount: summary.tvCount,
  };
}
