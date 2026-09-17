"use server";

import { getViewerContext } from "@/lib/integrations/library-owner";
import { runJob, type JobId as RegistryJobId } from "@/lib/jobs/registry";

export type JobId = RegistryJobId;

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

  const result = await runJob(jobId);
  return result.ok ? { success: true } : { error: result.error };
}
