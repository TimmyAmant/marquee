declare global {
  var __marqueeCronStarted: boolean | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (global.__marqueeCronStarted) return;
  global.__marqueeCronStarted = true;

  // Settings › Logs: everything the server writes to its console from here
  // on is kept (secrets masked) for the admin to read (lib/logs).
  const { installLogCapture } = await import("@/lib/logs/capture");
  installLogCapture();

  // Every scheduled job, on the schedule Settings › Jobs gives it
  // (lib/jobs/schedule.ts and scheduler.ts).
  const { startScheduler } = await import("@/lib/jobs/scheduler");
  await startScheduler();

  // Once shortly after starting, so the requests that were already in the
  // library before these notices existed are recorded as told (without
  // telling anyone) before a webhook can come along and announce them.
  const { checkCompletedRequests } = await import("@/lib/requests/complete");
  setTimeout(
    () =>
      void checkCompletedRequests().catch((err) => {
        console.error("[complete-check] startup check failed:", err);
      }),
    30_000,
  ).unref?.();
}
