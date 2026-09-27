import { redirect } from "next/navigation";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { RunJobButton } from "@/components/run-job-button";
import { jobDefinitions } from "@/lib/jobs/registry";
import { getT } from "@/lib/i18n/server";
import { NotFoundHoursSetting } from "@/components/not-found-hours-setting";
import { getNotFoundAfterHours } from "@/lib/requests/not-found";

export default async function JobsSettingsPage() {
  const viewer = await getViewerContext();
  if (!viewer.session || !viewer.isAdmin) redirect("/settings");
  const notFoundAfterHours = await getNotFoundAfterHours();
  const t = await getT();

  return (
    <div>
      <h2 className="font-display text-xl text-text-primary">{t("admin.jobsTitle")}</h2>
      <p className="mt-2 text-sm text-text-secondary">
        {t("admin.jobsIntro")}
      </p>

      <div className="mt-6 max-w-2xl overflow-hidden rounded-2xl border border-border bg-bg-1">
        <div className="divide-y divide-border">
          {jobDefinitions(t).map((job) => (
            <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="text-sm font-medium text-text-primary">{job.name}</p>
                <p className="mt-0.5 text-xs text-text-muted">{job.description}</p>
                <p className="mt-1 text-xs text-text-secondary">{job.schedule}</p>
                {job.id === "not-found-check" && <NotFoundHoursSetting initial={notFoundAfterHours} />}
              </div>
              <RunJobButton jobId={job.id} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
