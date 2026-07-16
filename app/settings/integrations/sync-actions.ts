"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { syncPlexLibrary } from "@/lib/plex/sync";
import { syncArrLibrary } from "@/lib/arr/sync";
import { getPlexCredential, getArrCredential } from "@/lib/integrations/credentials";
import * as radarr from "@/lib/radarr/client";

export type SyncNowState = { error?: string; success?: boolean; debug?: string };

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
  const [plexCred, sonarrCred, radarrCred] = await Promise.all([
    getPlexCredential(userId),
    getArrCredential(userId, "sonarr"),
    getArrCredential(userId, "radarr"),
  ]);

  const results = await Promise.allSettled([
    plexCred ? syncPlexLibrary(userId) : Promise.resolve(),
    sonarrCred ? syncArrLibrary(userId, "sonarr") : Promise.resolve(),
    radarrCred ? syncArrLibrary(userId, "radarr") : Promise.resolve(),
  ]);

  const failed = results.some((r) => r.status === "rejected");

  // TEMPORARY diagnostic — remove once the Radarr "Downloading" status bug
  // is confirmed fixed. Reports the raw queue vs movie list state so a
  // mismatch (or fetch failure) is visible without needing container logs.
  let debug: string = radarrCred ? "cred present, starting queue check" : "cred missing";
  if (radarrCred) {
    try {
      const config = { baseUrl: radarrCred.baseUrl, apiKey: radarrCred.apiKey };
      const [queuedIds, movies] = await Promise.all([
        radarr.getQueuedMovieIds(config),
        radarr.getAllMovies(config),
      ]);
      const runnerRunner = movies.find((m) => m.title.toLowerCase().includes("runner runner"));
      debug = JSON.stringify({
        queuedIds: [...queuedIds],
        runnerRunner: runnerRunner
          ? { id: runnerRunner.id, hasFile: runnerRunner.hasFile, monitored: runnerRunner.monitored }
          : "not found",
      });
    } catch (err) {
      debug = `queue check failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  revalidatePath("/library");
  revalidatePath("/settings/integrations");
  return failed
    ? { error: "Some integrations failed to sync — check their connection.", debug }
    : { success: true, debug };
}
