import { syncAllConnectedPlexUsers } from "@/lib/plex/sync";
import { syncAllConnectedJellyfinUsers } from "@/lib/jellyfin/sync";
import { syncAllConnectedArrUsers } from "@/lib/arr/sync";
import { checkArrAgainstMediaServers } from "@/lib/arr/media-server-check";
import { snapshotDiskSpaceForAllConnectedUsers } from "@/lib/integrations/disk-space";
import { pruneOldRecords } from "@/lib/jobs/cleanup";
import { syncAllPlexWatchlists } from "@/lib/plex/watchlist";
import { syncAllTraktSyncs } from "@/lib/trakt/sync";
import { checkNotFoundRequests } from "@/lib/requests/not-found";
import { checkCompletedRequests } from "@/lib/requests/complete";
import { fail, type CoreResult } from "@/lib/core-result";
import { getT } from "@/lib/i18n/server";
import type { MessageKey, Translator } from "@/lib/i18n/translator";

import {
  DEFAULT_JOB_SCHEDULES,
  JOB_IDS,
  effectiveSchedule,
  isJobId,
  nextRunAfter,
  serverTimeZone,
  type JobId,
  type JobSchedule,
} from "@/lib/jobs/schedule";

// The scheduled maintenance jobs (lib/jobs/scheduler.ts runs them) as listed
// on Settings → Jobs and GET /api/v1/settings/jobs, plus the manual "Run now".

export { JOB_IDS, isJobId, type JobId };

export type JobDefinition = {
  id: JobId;
  name: string;
  /** How often, in words ("Every 2 hours"). */
  schedule: string;
  description: string;
  /** How often, as the admin can change it (lib/jobs/schedule.ts). */
  interval: JobSchedule;
  defaultInterval: JobSchedule;
  /** ISO 8601; when it'll next run on its own. */
  nextRunAt: string;
  /** ISO 8601; when it last finished since the server started, or null. */
  lastRunAt: string | null;
  /** Running right now (on its schedule or from Run now). */
  running: boolean;
  /** The IANA zone a daily time runs in — the server's (TZ), e.g. "UTC". */
  timeZone: string;
};

// Names and descriptions are message keys, put into words by jobDefinitions
// in the reader's language; the ids never change.
const JOB_TEXT: Record<JobId, { name: MessageKey; description: MessageKey }> = {
  "plex-sync": { name: "admin.jobPlexSyncName", description: "admin.jobPlexSyncDescription" },
  "jellyfin-sync": { name: "admin.jobJellyfinSyncName", description: "admin.jobJellyfinSyncDescription" },
  "arr-sync": { name: "admin.jobArrSyncName", description: "admin.jobArrSyncDescription" },
  "plex-watchlist": { name: "admin.jobPlexWatchlistName", description: "admin.jobPlexWatchlistDescription" },
  "trakt-sync": { name: "admin.jobTraktSyncName", description: "admin.jobTraktSyncDescription" },
  "not-found-check": { name: "admin.jobNotFoundCheckName", description: "admin.jobNotFoundCheckDescription" },
  "disk-space-snapshot": { name: "admin.jobDiskSpaceName", description: "admin.jobDiskSpaceDescription" },
  cleanup: { name: "admin.jobCleanupName", description: "admin.jobCleanupDescription" },
};

export function scheduleText(t: Translator, schedule: JobSchedule, timeZone = serverTimeZone()): string {
  if ("dailyAt" in schedule) {
    // A wall-clock time in the server's zone, which is named alongside it:
    // formatted as UTC only so nothing shifts the hour and minute themselves.
    const time = new Date(Date.UTC(2000, 0, 1, schedule.dailyAt.hour, schedule.dailyAt.minute)).toLocaleTimeString(
      t.tag,
      { hour: "numeric", minute: "2-digit", timeZone: "UTC" },
    );
    return t("admin.scheduleDailyAt", { time, zone: timeZone });
  }
  return t(schedule.every === "minutes" ? "admin.scheduleEveryMinutes" : "admin.scheduleEveryHours", {
    count: schedule.count,
  });
}

// What's happened since the server started, shared by the scheduler and
// Run now (one process serves both).
declare global {
  var __marqueeJobState: { lastRunAt: Map<JobId, Date>; running: Set<JobId> } | undefined;
}

function jobState() {
  globalThis.__marqueeJobState ??= { lastRunAt: new Map(), running: new Set() };
  return globalThis.__marqueeJobState;
}

/** Every job, in `t`'s language, in the order Settings › Jobs lists them,
 * with the schedules the admin chose (`stored`, from
 * lib/jobs/schedule-store.ts). */
export function jobDefinitions(t: Translator, stored: Record<string, unknown> = {}, now = new Date()): JobDefinition[] {
  const state = jobState();
  const timeZone = serverTimeZone();
  return JOB_IDS.map((id) => {
    const text = JOB_TEXT[id];
    const interval = effectiveSchedule(id, stored);
    return {
      id,
      name: t(text.name),
      schedule: scheduleText(t, interval, timeZone),
      description: t(text.description),
      interval,
      defaultInterval: DEFAULT_JOB_SCHEDULES[id].schedule,
      nextRunAt: nextRunAfter(interval, DEFAULT_JOB_SCHEDULES[id].offset, now).toISOString(),
      lastRunAt: state.lastRunAt.get(id)?.toISOString() ?? null,
      running: state.running.has(id),
      timeZone,
    };
  });
}

/** A library sync, then a word with Sonarr/Radarr about anything Plex or
 * Jellyfin has that they haven't noticed yet (lib/arr/media-server-check.ts),
 * then the "ready to watch" check (lib/requests/complete.ts) against what
 * they found. */
function thenCheckComplete(sync: () => Promise<void>): () => Promise<void> {
  return async () => {
    await sync();
    await checkArrAgainstMediaServers().catch((err) => {
      console.error("[media-check] check after sync failed:", err);
    });
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

/** A job's runner; undefined for anything that isn't one of the jobs. Spelled
 * out, so a name from a request can only ever pick one of these. */
function runnerFor(jobId: string): (() => Promise<void>) | undefined {
  switch (jobId) {
    case "plex-sync":
      return JOB_RUNNERS["plex-sync"];
    case "jellyfin-sync":
      return JOB_RUNNERS["jellyfin-sync"];
    case "arr-sync":
      return JOB_RUNNERS["arr-sync"];
    case "plex-watchlist":
      return JOB_RUNNERS["plex-watchlist"];
    case "trakt-sync":
      return JOB_RUNNERS["trakt-sync"];
    case "not-found-check":
      return JOB_RUNNERS["not-found-check"];
    case "disk-space-snapshot":
      return JOB_RUNNERS["disk-space-snapshot"];
    case "cleanup":
      return JOB_RUNNERS.cleanup;
    default:
      return undefined;
  }
}

/** Runs a job and records it, however it was started. Throws what the job
 * threw. Answers false, without running anything, when the job is already
 * running — on its schedule or from Run now — so the two can never overlap.
 * The check and the claim happen in one synchronous step, so two callers
 * arriving together can't both get through. */
export async function runRecorded(jobId: JobId): Promise<boolean> {
  const state = jobState();
  if (state.running.has(jobId)) return false;
  state.running.add(jobId);
  try {
    await runnerFor(jobId)?.();
  } finally {
    state.running.delete(jobId);
    state.lastRunAt.set(jobId, new Date());
  }
  return true;
}

/** Runs one of the scheduled jobs immediately, without waiting for its cron
 * time — running it early never skips or alters the schedule. Refused while
 * the job is already running. Admin-only at every call site, since these
 * sync every connected user's data. */
export async function runJob(jobId: JobId): Promise<CoreResult> {
  const t = await getT();
  if (!runnerFor(jobId)) return fail("not_found", t("admin.unknownJob"));

  try {
    if (!(await runRecorded(jobId))) return fail("conflict", t("admin.jobAlreadyRunning"));
    return { ok: true };
  } catch (err) {
    console.error("[jobs] manual run of %s failed:", jobId, err);
    return fail("internal", t("admin.jobFailed"));
  }
}
