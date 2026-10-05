"use client";

import { useState } from "react";
import { saveJobScheduleAction } from "@/app/settings/jobs/actions";
import { HOUR_PRESETS, MINUTE_PRESETS, sameSchedule, type JobId, type JobSchedule } from "@/lib/jobs/schedule";
import type { JobDefinition } from "@/lib/jobs/registry";
import { formatDate } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/client";
import { showToast } from "@/components/toast";

// Settings › Jobs: how often one job runs — a preset, or once a day at a
// time — with when it runs next and last ran. Saved with its own button,
// and the job moves to its new schedule straight away.

const SELECT =
  "rounded-lg border border-border bg-bg-0 px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent";

function keyOf(schedule: JobSchedule): string {
  return "dailyAt" in schedule ? "daily" : `${schedule.every}:${schedule.count}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function JobScheduleSetting({ job: initial }: { job: JobDefinition }) {
  const t = useT();
  const [job, setJob] = useState(initial);
  const [draft, setDraft] = useState<JobSchedule>(initial.interval);
  const [busy, setBusy] = useState(false);
  const changed = !sameSchedule(draft, job.interval);
  const isDefault = sameSchedule(job.interval, job.defaultInterval);

  function pick(value: string) {
    if (value === "daily") {
      setDraft("dailyAt" in draft ? draft : { dailyAt: { hour: 3, minute: 0 } });
      return;
    }
    const [every, count] = value.split(":");
    setDraft({ every: every as "minutes" | "hours", count: Number(count) });
  }

  async function save(next: JobSchedule | null) {
    setBusy(true);
    const result = await saveJobScheduleAction(job.id as JobId, next).catch(() => ({ error: t("common.somethingWentWrong") }));
    setBusy(false);
    if ("job" in result && result.job) {
      setJob(result.job);
      setDraft(result.job.interval);
      showToast(t("admin.jobScheduleSaved"));
    } else {
      showToast(("error" in result && result.error) || t("common.somethingWentWrong"), "error");
    }
  }

  const daily = "dailyAt" in draft ? draft.dailyAt : null;

  return (
    <span className="mt-2 flex flex-col gap-1.5 text-xs text-text-secondary">
      <span className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t("admin.jobHowOften", { job: job.name })}
          value={keyOf(draft)}
          onChange={(e) => pick(e.target.value)}
          className={SELECT}
        >
          {MINUTE_PRESETS.map((count) => (
            <option key={`m${count}`} value={`minutes:${count}`}>
              {t("admin.scheduleEveryMinutes", { count })}
            </option>
          ))}
          {HOUR_PRESETS.map((count) => (
            <option key={`h${count}`} value={`hours:${count}`}>
              {t("admin.scheduleEveryHours", { count })}
            </option>
          ))}
          <option value="daily">{t("admin.scheduleDaily")}</option>
        </select>
        {daily && (
          <input
            type="time"
            aria-label={t("admin.jobDailyTime")}
            value={`${pad(daily.hour)}:${pad(daily.minute)}`}
            onChange={(e) => {
              const [hour, minute] = e.target.value.split(":").map(Number);
              if (Number.isInteger(hour) && Number.isInteger(minute)) setDraft({ dailyAt: { hour, minute } });
            }}
            className={SELECT}
          />
        )}
        {daily && <span className="text-text-muted">{t("admin.jobDailyTimeZone", { zone: job.timeZone })}</span>}
        {changed && (
          <button
            type="button"
            disabled={busy}
            onClick={() => save(draft)}
            className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-bg-0 hover:bg-accent-hover disabled:opacity-60"
          >
            {busy ? t("common.saving") : t("common.save")}
          </button>
        )}
        {!changed && !isDefault && (
          <button
            type="button"
            disabled={busy}
            onClick={() => save(null)}
            className="text-xs text-text-secondary underline-offset-2 hover:text-accent hover:underline"
          >
            {t("admin.jobScheduleReset")}
          </button>
        )}
      </span>
      <span className="text-text-muted">
        {t("admin.jobNextRun", { time: formatDate(t, job.nextRunAt, "dateTime") })}
        {job.lastRunAt && ` · ${t("admin.jobLastRun", { time: formatDate(t, job.lastRunAt, "dateTime") })}`}
      </span>
    </span>
  );
}
