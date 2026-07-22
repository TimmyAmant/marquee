"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { syncPlexLibrary } from "@/lib/plex/sync";
import { syncJellyfinLibrary } from "@/lib/jellyfin/sync";
import { syncArrLibrary } from "@/lib/arr/sync";
import { getPlexCredential, getArrCredential, getJellyfinCredential } from "@/lib/integrations/credentials";

export type SyncNowState = { error?: string; success?: boolean };

/** Forces an immediate sync of every connected integration, bypassing the
 * usual 15-minute staleness gate — for when you don't want to wait for it
 * (e.g. right after starting a download) rather than an actual bug in the
 * automatic sync. */
export async function syncNowAction(
  _prevState: SyncNowState | undefined,
  _formData: FormData,
): Promise<SyncNowState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in required." };

  const userId = session.user.id;
  const [plexCred, jellyfinCred, sonarrCred, radarrCred] = await Promise.all([
    getPlexCredential(userId),
    getJellyfinCredential(userId),
    getArrCredential(userId, "sonarr"),
    getArrCredential(userId, "radarr"),
  ]);

  const results = await Promise.allSettled([
    plexCred ? syncPlexLibrary(userId) : Promise.resolve(),
    jellyfinCred ? syncJellyfinLibrary(userId) : Promise.resolve(),
    sonarrCred ? syncArrLibrary(userId, "sonarr") : Promise.resolve(),
    radarrCred ? syncArrLibrary(userId, "radarr") : Promise.resolve(),
  ]);

  const failed = results.some((r) => r.status === "rejected");

  revalidatePath("/settings/integrations");
  return failed
    ? { error: "Some integrations failed to sync — check their connection." }
    : { success: true };
}
