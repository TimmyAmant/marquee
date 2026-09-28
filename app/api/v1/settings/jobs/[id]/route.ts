import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { ApiError, msg } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";
import { isJobId, jobDefinitions } from "@/lib/jobs/registry";
import { getStoredJobSchedules, saveJobSchedule } from "@/lib/jobs/schedule-store";
import { rescheduleJob } from "@/lib/jobs/scheduler";
import { getT } from "@/lib/i18n/server";
import type { Job } from "@/lib/api/types";

/** Change how often a job runs (admin). Body: { "interval": { "every":
 * "minutes" | "hours", "count": n } | { "dailyAt": { "hour", "minute" } } |
 * null } — null puts it back to its default. Answers with the job. */
export const PUT = withApi<{ id: string }>(async (request, params): Promise<Job> => {
  await requireApiAdmin(request, msg("server.onlyAdminJobs"));
  if (!isJobId(params.id)) throw ApiError.of("not_found", msg("server.unknownJob"));
  const body = await readJsonBody(request);
  if (!("interval" in body)) throw ApiError.of("invalid", msg("admin.jobScheduleInvalid"));
  unwrap(await saveJobSchedule(params.id, body.interval));
  await rescheduleJob(params.id);
  const job = jobDefinitions(await getT(), await getStoredJobSchedules()).find((j) => j.id === params.id);
  return job!;
});
