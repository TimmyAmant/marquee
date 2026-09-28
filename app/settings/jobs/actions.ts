"use server";

import { getViewerContext } from "@/lib/integrations/library-owner";
import { isJobId, jobDefinitions, runJob, type JobDefinition, type JobId as RegistryJobId } from "@/lib/jobs/registry";
import { getStoredJobSchedules, saveJobSchedule } from "@/lib/jobs/schedule-store";
import { rescheduleJob } from "@/lib/jobs/scheduler";
import { saveNotFoundAfterHours } from "@/lib/requests/not-found";
import { getT } from "@/lib/i18n/server";

export type JobId = RegistryJobId;

export type RunJobState = { success?: true; error?: string } | undefined;

/** Manually triggers one of instrumentation.ts's scheduled jobs immediately,
 * without waiting for its cron time — running it early never skips or
 * alters the schedule, matching how Seerr's own "Run Now" works. Admin-only
 * since these sync every connected user's data, not just the caller's own. */
export async function runJobAction(jobId: JobId, _prevState: RunJobState): Promise<RunJobState> {
  const viewer = await getViewerContext();
  if (!viewer.session || !viewer.isAdmin) {
    return { error: (await getT())("admin.onlyAdminRunJobs") };
  }

  const result = await runJob(jobId);
  return result.ok ? { success: true } : { error: result.error };
}

/** The Can't Find Check's wait: hours after approval (1–720). */
export async function saveNotFoundAfterHoursAction(hours: number): Promise<{ afterHours?: number; error?: string }> {
  const viewer = await getViewerContext();
  if (!viewer.session || !viewer.isAdmin) return { error: (await getT())("admin.onlyAdminChange") };
  const result = await saveNotFoundAfterHours(hours);
  return result.ok ? { afterHours: result.afterHours } : { error: result.error };
}

/** How often a job runs (Settings › Jobs); null puts it back to its
 * default. Answers with the job as it is now (its next run moved). */
export async function saveJobScheduleAction(
  jobId: JobId,
  interval: unknown,
): Promise<{ job?: JobDefinition; error?: string }> {
  const viewer = await getViewerContext();
  const t = await getT();
  if (!viewer.session || !viewer.isAdmin) return { error: t("admin.onlyAdminChange") };
  if (typeof jobId !== "string" || !isJobId(jobId)) return { error: t("admin.unknownJob") };
  const result = await saveJobSchedule(jobId, interval);
  if (!result.ok) return { error: result.error };
  await rescheduleJob(jobId);
  return { job: jobDefinitions(t, await getStoredJobSchedules()).find((j) => j.id === jobId) };
}
