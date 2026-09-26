import { syncAllConnectedPlexUsers } from "@/lib/plex/sync";
import { syncAllConnectedJellyfinUsers } from "@/lib/jellyfin/sync";
import { syncAllConnectedArrUsers } from "@/lib/arr/sync";
import { snapshotDiskSpaceForAllConnectedUsers } from "@/lib/integrations/disk-space";
import { pruneOldRecords } from "@/lib/jobs/cleanup";
import { syncAllPlexWatchlists } from "@/lib/plex/watchlist";
import { checkNotFoundRequests } from "@/lib/requests/not-found";
import { fail, type CoreResult } from "@/lib/core-result";

// The scheduled maintenance jobs (see instrumentation.ts) as listed on
// Settings → Jobs and GET /api/v1/settings/jobs, plus the manual "Run now".

export const JOB_IDS = [
  "plex-sync",
  "jellyfin-sync",
  "arr-sync",
  "plex-watchlist",
  "not-found-check",
  "disk-space-snapshot",
  "cleanup",
] as const;
export type JobId = (typeof JOB_IDS)[number];

export type JobDefinition = { id: JobId; name: string; schedule: string; description: string };

export const JOBS: JobDefinition[] = [
  {
    id: "plex-sync",
    name: "Plex Library Sync",
    schedule: "Every hour",
    description: "Pulls the latest library state from every connected Plex server.",
  },
  {
    id: "jellyfin-sync",
    name: "Jellyfin Library Sync",
    schedule: "Every hour",
    description: "Pulls the latest library state from every connected Jellyfin server.",
  },
  {
    id: "arr-sync",
    name: "Sonarr/Radarr Sync",
    schedule: "Every hour",
    description: "Refreshes tracked/monitored status from every connected Sonarr and Radarr instance.",
  },
  {
    id: "plex-watchlist",
    name: "Plex Watchlist Requests",
    schedule: "Every 10 minutes",
    description:
      "Requests the new movies and shows on the Plex Watchlist of everyone who turned it on, like pressing Request for each.",
  },
  {
    id: "not-found-check",
    name: "Can't Find Check",
    schedule: "Every hour",
    description:
      "Looks for approved requests that Sonarr/Radarr still hasn't found a copy of, and tells the admin and trusted members.",
  },
  {
    id: "disk-space-snapshot",
    name: "Disk Space Snapshot",
    schedule: "Daily at 3:00 AM",
    description: "Records free/used disk space for the storage forecast shown elsewhere in the app.",
  },
  {
    id: "cleanup",
    name: "Database Cleanup",
    schedule: "Daily at 3:30 AM",
    description:
      "Clears out old notifications and activity, year-old disk snapshots, and expired app sign-ins so the database doesn't grow forever.",
  },
];

const JOB_RUNNERS: Record<JobId, () => Promise<void>> = {
  "plex-sync": syncAllConnectedPlexUsers,
  "jellyfin-sync": syncAllConnectedJellyfinUsers,
  "arr-sync": syncAllConnectedArrUsers,
  "plex-watchlist": syncAllPlexWatchlists,
  "not-found-check": () => checkNotFoundRequests(),
  "disk-space-snapshot": snapshotDiskSpaceForAllConnectedUsers,
  cleanup: pruneOldRecords,
};

export function isJobId(value: string): value is JobId {
  return (JOB_IDS as readonly string[]).includes(value);
}

/** Runs one of the scheduled jobs immediately, without waiting for its cron
 * time — running it early never skips or alters the schedule. Admin-only at
 * every call site, since these sync every connected user's data. */
export async function runJob(jobId: JobId): Promise<CoreResult> {
  const runner = JOB_RUNNERS[jobId];
  if (!runner) return fail("not_found", "Unknown job.");

  try {
    await runner();
    return { ok: true };
  } catch (err) {
    console.error(`[jobs] manual run of ${jobId} failed:`, err);
    return fail("internal", "Job failed — check the server logs.");
  }
}
