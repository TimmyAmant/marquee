import { DEFAULT_JOB_SCHEDULES, JOB_IDS, cronExpression, effectiveSchedule, type JobId } from "@/lib/jobs/schedule";
import { getStoredJobSchedules } from "@/lib/jobs/schedule-store";
import { runRecorded } from "@/lib/jobs/registry";

// The cron tasks behind Settings › Jobs: one per job, on the schedule the
// admin chose (lib/jobs/schedule.ts). Started once from instrumentation.ts;
// changing a schedule replaces that job's task straight away. A run that's
// still going when the next one is due is skipped rather than doubled up.

type Task = { stop: () => void };

declare global {
  var __marqueeCronTasks: Map<JobId, Task> | undefined;
  var __marqueeDownloadWatchTask: Task | undefined;
}

function tasks(): Map<JobId, Task> {
  globalThis.__marqueeCronTasks ??= new Map();
  return globalThis.__marqueeCronTasks;
}

const busy = new Set<JobId>();

async function scheduleJob(jobId: JobId, stored: Record<string, unknown>): Promise<void> {
  const cron = await import("node-cron");
  tasks().get(jobId)?.stop();
  const expression = cronExpression(effectiveSchedule(jobId, stored), DEFAULT_JOB_SCHEDULES[jobId].offset);
  const task = cron.schedule(expression, () => {
    if (busy.has(jobId)) {
      console.warn(`[${jobId}] still running from last time; skipping this run`);
      return;
    }
    busy.add(jobId);
    runRecorded(jobId)
      .catch((err) => console.error(`[${jobId}] scheduled run failed:`, err))
      .finally(() => busy.delete(jobId));
  });
  tasks().set(jobId, task);
}

/** Starts every job's task (instrumentation.ts, once per server). */
export async function startScheduler(): Promise<void> {
  const stored = await getStoredJobSchedules().catch((err) => {
    // The database may not be up yet on a first start: the defaults run.
    console.error("[jobs] couldn't read the job schedules; using the defaults:", err);
    return {};
  });
  for (const jobId of JOB_IDS) await scheduleJob(jobId, stored);
  await startDownloadWatch();
  console.info(`[jobs] scheduled ${JOB_IDS.length} jobs`);
}

/** The download watch (lib/arr/download-watch.ts): every minute, not one of
 * Settings › Jobs — it's how the hourly Sonarr/Radarr sync keeps up with
 * downloads in between, and costs next to nothing when nothing's coming. */
async function startDownloadWatch(): Promise<void> {
  const cron = await import("node-cron");
  globalThis.__marqueeDownloadWatchTask?.stop();
  let running = false;
  globalThis.__marqueeDownloadWatchTask = cron.schedule("* * * * *", () => {
    if (running) return;
    running = true;
    import("@/lib/arr/download-watch")
      .then(({ watchDownloads }) => watchDownloads())
      .catch((err) => console.error("[download-watch] run failed:", err))
      .finally(() => {
        running = false;
      });
  });
}

/** Puts a job on its newly saved schedule. Only where the scheduler runs
 * (the server process that started it). */
export async function rescheduleJob(jobId: JobId): Promise<void> {
  if (!tasks().has(jobId)) return;
  await scheduleJob(jobId, await getStoredJobSchedules());
  console.info(`[jobs] ${jobId} rescheduled`);
}
