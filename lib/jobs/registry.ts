import { syncAllConnectedPlexUsers } from "@/lib/plex/sync";
import { syncAllConnectedJellyfinUsers } from "@/lib/jellyfin/sync";
import { syncAllConnectedArrUsers } from "@/lib/arr/sync";
import { snapshotDiskSpaceForAllConnectedUsers } from "@/lib/integrations/disk-space";
import { pruneOldRecords } from "@/lib/jobs/cleanup";
import { syncAllPlexWatchlists } from "@/lib/plex/watchlist";
import { syncAllTraktSyncs } from "@/lib/trakt/sync";
import { checkNotFoundRequests } from "@/lib/requests/not-found";
import { checkCompletedRequests } from "@/lib/requests/complete";
import { fail, type CoreResult } from "@/lib/core-result";
import { getT } from "@/lib/i18n/server";
import type { MessageKey, Translator } from "@/lib/i18n/translator";

// The scheduled maintenance jobs (see instrumentation.ts) as listed on
// Settings → Jobs and GET /api/v1/settings/jobs, plus the manual "Run now".

export const JOB_IDS = [
  "plex-sync",
  "jellyfin-sync",
  "arr-sync",
  "plex-watchlist",
  "trakt-sync",
  "not-found-check",
  "disk-space-snapshot",
  "cleanup",
] as const;
export type JobId = (typeof JOB_IDS)[number];

export type JobDefinition = { id: JobId; name: string; schedule: string; description: string };

/** How often a job runs (instrumentation.ts has the cron itself). */
type JobSchedule = { every: "minutes" | "hours"; count: number } | { dailyAt: { hour: number; minute: number } };

// Names and descriptions are message keys, put into words by jobDefinitions
// in the reader's language; the ids never change.
const JOB_TEXT: Record<JobId, { name: MessageKey; description: MessageKey; schedule: JobSchedule }> = {
  "plex-sync": {
    name: "admin.jobPlexSyncName",
    description: "admin.jobPlexSyncDescription",
    schedule: { every: "hours", count: 1 },
  },
  "jellyfin-sync": {
    name: "admin.jobJellyfinSyncName",
    description: "admin.jobJellyfinSyncDescription",
    schedule: { every: "hours", count: 1 },
  },
  "arr-sync": {
    name: "admin.jobArrSyncName",
    description: "admin.jobArrSyncDescription",
    schedule: { every: "hours", count: 1 },
  },
  "plex-watchlist": {
    name: "admin.jobPlexWatchlistName",
    description: "admin.jobPlexWatchlistDescription",
    schedule: { every: "minutes", count: 10 },
  },
  "trakt-sync": {
    name: "admin.jobTraktSyncName",
    description: "admin.jobTraktSyncDescription",
    schedule: { every: "hours", count: 3 },
  },
  "not-found-check": {
    name: "admin.jobNotFoundCheckName",
    description: "admin.jobNotFoundCheckDescription",
    schedule: { every: "hours", count: 1 },
  },
  "disk-space-snapshot": {
    name: "admin.jobDiskSpaceName",
    description: "admin.jobDiskSpaceDescription",
    schedule: { dailyAt: { hour: 3, minute: 0 } },
  },
  cleanup: {
    name: "admin.jobCleanupName",
    description: "admin.jobCleanupDescription",
    schedule: { dailyAt: { hour: 3, minute: 30 } },
  },
};

function scheduleText(t: Translator, schedule: JobSchedule): string {
  if ("dailyAt" in schedule) {
    // A wall-clock time with no date or zone to it: formatted as UTC so the
    // server's own zone can't shift it.
    const time = new Date(Date.UTC(2000, 0, 1, schedule.dailyAt.hour, schedule.dailyAt.minute)).toLocaleTimeString(
      t.tag,
      { hour: "numeric", minute: "2-digit", timeZone: "UTC" },
    );
    return t("admin.scheduleDailyAt", { time });
  }
  return t(schedule.every === "minutes" ? "admin.scheduleEveryMinutes" : "admin.scheduleEveryHours", {
    count: schedule.count,
  });
}

/** Every job, in `t`'s language, in the order Settings › Jobs lists them. */
export function jobDefinitions(t: Translator): JobDefinition[] {
  return JOB_IDS.map((id) => {
    const text = JOB_TEXT[id];
    return { id, name: t(text.name), schedule: scheduleText(t, text.schedule), description: t(text.description) };
  });
}

/** A library sync, then the "ready to watch" check (lib/requests/complete.ts)
 * against what it found. */
function thenCheckComplete(sync: () => Promise<void>): () => Promise<void> {
  return async () => {
    await sync();
    await checkCompletedRequests().catch((err) => {
      console.error("[complete-check] check after sync failed:", err);
    });
  };
}

const JOB_RUNNERS: Record<JobId, () => Promise<void>> = {
  "plex-sync": thenCheckComplete(syncAllConnectedPlexUsers),
  "jellyfin-sync": thenCheckComplete(syncAllConnectedJellyfinUsers),
  "arr-sync": thenCheckComplete(syncAllConnectedArrUsers),
  "plex-watchlist": syncAllPlexWatchlists,
  "trakt-sync": syncAllTraktSyncs,
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
  const t = await getT();
  const runner = JOB_RUNNERS[jobId];
  if (!runner) return fail("not_found", t("admin.unknownJob"));

  try {
    await runner();
    return { ok: true };
  } catch (err) {
    console.error("[jobs] manual run of %s failed:", jobId, err);
    return fail("internal", t("admin.jobFailed"));
  }
}
