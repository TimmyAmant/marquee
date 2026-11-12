// How often each scheduled job runs (Settings › Jobs): a few minutes, a few
// hours, or once a day at a time. The admin picks from presets; each job
// keeps its own minute past the hour so they don't all start at once. Pure:
// the stored choices are read in lib/jobs/schedule-store.ts and the cron
// tasks live in lib/jobs/scheduler.ts. Times are the server's own clock,
// like node-cron's.

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

export function isJobId(value: string): value is JobId {
  return (JOB_IDS as readonly string[]).includes(value);
}

export const MINUTE_PRESETS = [5, 10, 15, 30] as const;
export const HOUR_PRESETS = [1, 2, 3, 4, 6, 8, 12] as const;

export type JobSchedule =
  | { every: "minutes"; count: number }
  | { every: "hours"; count: number }
  | { dailyAt: { hour: number; minute: number } };

/** Each job's schedule out of the box, and the minute past the hour its
 * repeating runs keep (so the hourly syncs, the can't-find check after them
 * and the Trakt sync don't pile up). */
export const DEFAULT_JOB_SCHEDULES: Record<JobId, { schedule: JobSchedule; offset: number }> = {
  "plex-sync": { schedule: { every: "hours", count: 1 }, offset: 0 },
  "jellyfin-sync": { schedule: { every: "hours", count: 1 }, offset: 0 },
  "arr-sync": { schedule: { every: "hours", count: 1 }, offset: 0 },
  "plex-watchlist": { schedule: { every: "minutes", count: 10 }, offset: 5 },
  "trakt-sync": { schedule: { every: "hours", count: 3 }, offset: 40 },
  "not-found-check": { schedule: { every: "hours", count: 1 }, offset: 20 },
  "disk-space-snapshot": { schedule: { dailyAt: { hour: 3, minute: 0 } }, offset: 0 },
  cleanup: { schedule: { dailyAt: { hour: 3, minute: 30 } }, offset: 30 },
};

export type ParsedSchedule = { ok: true; schedule: JobSchedule } | { ok: false };

/** A schedule sent by Settings or the API, checked against the presets. */
export function parseJobSchedule(value: unknown): ParsedSchedule {
  if (!value || typeof value !== "object") return { ok: false };
  const v = value as Record<string, unknown>;
  if (v.every === "minutes" && (MINUTE_PRESETS as readonly number[]).includes(v.count as number)) {
    return { ok: true, schedule: { every: "minutes", count: v.count as number } };
  }
  if (v.every === "hours" && (HOUR_PRESETS as readonly number[]).includes(v.count as number)) {
    return { ok: true, schedule: { every: "hours", count: v.count as number } };
  }
  const daily = v.dailyAt as Record<string, unknown> | undefined;
  if (daily && typeof daily === "object") {
    const { hour, minute } = daily;
    if (
      Number.isInteger(hour) &&
      Number.isInteger(minute) &&
      (hour as number) >= 0 &&
      (hour as number) <= 23 &&
      (minute as number) >= 0 &&
      (minute as number) <= 59
    ) {
      return { ok: true, schedule: { dailyAt: { hour: hour as number, minute: minute as number } } };
    }
  }
  return { ok: false };
}

/** The job's schedule: the admin's choice when there's a valid one. */
export function effectiveSchedule(jobId: JobId, stored: Record<string, unknown> | null | undefined): JobSchedule {
  const parsed = parseJobSchedule(stored?.[jobId]);
  return parsed.ok ? parsed.schedule : DEFAULT_JOB_SCHEDULES[jobId].schedule;
}

export function sameSchedule(a: JobSchedule, b: JobSchedule): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The zone the schedules run in: the server process's own (TZ in Docker,
 * UTC when it isn't set). node-cron and nextRunAfter both read the clock in
 * it, so a "daily at" time is a time there, not in the viewer's zone. */
export function serverTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** node-cron's expression for it. */
export function cronExpression(schedule: JobSchedule, offset: number): string {
  if ("dailyAt" in schedule) return `${schedule.dailyAt.minute} ${schedule.dailyAt.hour} * * *`;
  if (schedule.every === "minutes") return `${offset % schedule.count}-59/${schedule.count} * * * *`;
  return schedule.count === 1 ? `${offset % 60} * * * *` : `${offset % 60} */${schedule.count} * * *`;
}

function runsAt(schedule: JobSchedule, offset: number, at: Date): boolean {
  const minute = at.getMinutes();
  const hour = at.getHours();
  if ("dailyAt" in schedule) return hour === schedule.dailyAt.hour && minute === schedule.dailyAt.minute;
  if (schedule.every === "minutes") return minute % schedule.count === offset % schedule.count;
  return minute === offset % 60 && hour % schedule.count === 0;
}

/** When it next runs after `from` (the minute after, at the earliest). */
export function nextRunAfter(schedule: JobSchedule, offset: number, from: Date): Date {
  const at = new Date(from);
  at.setSeconds(0, 0);
  for (let i = 0; i < 2 * 24 * 60; i++) {
    at.setMinutes(at.getMinutes() + 1);
    if (runsAt(schedule, offset, at)) return new Date(at);
  }
  // Every schedule above runs at least once a day; this is never reached.
  return at;
}
