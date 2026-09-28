import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { appSettings } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";
import { getT } from "@/lib/i18n/server";
import {
  DEFAULT_JOB_SCHEDULES,
  parseJobSchedule,
  sameSchedule,
  type JobId,
  type JobSchedule,
} from "@/lib/jobs/schedule";

// The admin's job schedules (app_settings.job_schedules). Only changed jobs
// are stored; putting one back to its default removes it.

export async function getStoredJobSchedules(): Promise<Record<string, unknown>> {
  const [row] = await db.select({ schedules: appSettings.jobSchedules }).from(appSettings).limit(1);
  return (row?.schedules as Record<string, unknown> | null) ?? {};
}

/** Saves a job's schedule (null: back to its default) and says what it is now. */
export async function saveJobSchedule(jobId: JobId, value: unknown): Promise<CoreResult<{ schedule: JobSchedule }>> {
  let schedule: JobSchedule;
  if (value === null) {
    schedule = DEFAULT_JOB_SCHEDULES[jobId].schedule;
  } else {
    const parsed = parseJobSchedule(value);
    if (!parsed.ok) return fail("invalid", (await getT())("admin.jobScheduleInvalid"));
    schedule = parsed.schedule;
  }
  const stored = { ...(await getStoredJobSchedules()) };
  if (sameSchedule(schedule, DEFAULT_JOB_SCHEDULES[jobId].schedule)) delete stored[jobId];
  else stored[jobId] = schedule;
  const [existing] = await db.select({ id: appSettings.id }).from(appSettings).limit(1);
  if (existing) {
    await db.update(appSettings).set({ jobSchedules: stored, updatedAt: new Date() }).where(eq(appSettings.id, existing.id));
  } else {
    await db.insert(appSettings).values({ jobSchedules: stored });
  }
  return { ok: true, schedule };
}
