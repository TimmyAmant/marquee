"use server";

import { getViewerContext } from "@/lib/integrations/library-owner";
import { syncAllConnectedPlexUsers } from "@/lib/plex/sync";
import { syncAllConnectedJellyfinUsers } from "@/lib/jellyfin/sync";
import { syncAllConnectedArrUsers } from "@/lib/arr/sync";
import { snapshotDiskSpaceForAllConnectedUsers } from "@/lib/integrations/disk-space";

export const JOB_IDS = ["plex-sync", "jellyfin-sync", "arr-sync", "disk-space-snapshot"] as const;
export type JobId = (typeof JOB_IDS)[number];

const JOB_RUNNERS: Record<JobId, () => Promise<void>> = {
  "plex-sync": syncAllConnectedPlexUsers,
  "jellyfin-sync": syncAllConnectedJellyfinUsers,
  "arr-sync": syncAllConnectedArrUsers,
  "disk-space-snapshot": snapshotDiskSpaceForAllConnectedUsers,
};

export type RunJobState = { success?: true; error?: string } | undefined;

/** Manually triggers one of instrumentation.ts's scheduled jobs immediately,
 * without waiting for its cron time — running it early never skips or
 * alters the schedule, matching how Seerr's own "Run Now" works. Admin-only
 * since these sync every connected user's data, not just the caller's own. */
export async function runJobAction(jobId: JobId, _prevState: RunJobState): Promise<RunJobState> {
  const viewer = await getViewerContext();
  if (!viewer.session || !viewer.isAdmin) {
    return { error: "Only the admin can run jobs." };
  }

  const runner = JOB_RUNNERS[jobId];
  if (!runner) return { error: "Unknown job." };

  try {
    await runner();
    return { success: true };
  } catch (err) {
    console.error(`[jobs] manual run of ${jobId} failed:`, err);
    return { error: "Job failed — check the server logs." };
  }
}
