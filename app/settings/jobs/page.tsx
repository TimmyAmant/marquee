import { redirect } from "next/navigation";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { RunJobButton } from "@/components/run-job-button";
import { jobDefinitions } from "@/lib/jobs/registry";
import { getT } from "@/lib/i18n/server";
import { NotFoundHoursSetting } from "@/components/not-found-hours-setting";
import { getNotFoundAfterHours } from "@/lib/requests/not-found";
import { SettingRow, SettingsGroup, SettingsHeader, SettingsSection } from "@/components/settings/settings-ui";
import { JobScheduleSetting } from "@/components/job-schedule-setting";
import { getStoredJobSchedules } from "@/lib/jobs/schedule-store";

export default async function JobsSettingsPage() {
  const viewer = await getViewerContext();
  if (!viewer.session || !viewer.isAdmin) redirect("/settings");
  const [notFoundAfterHours, stored, t] = await Promise.all([getNotFoundAfterHours(), getStoredJobSchedules(), getT()]);

  return (
    <div>
      <SettingsHeader title={t("admin.jobsTitle")} description={t("admin.jobsIntro")} />

      <SettingsSection>
        <SettingsGroup>
          {jobDefinitions(t, stored).map((job) => (
            <SettingRow
              key={job.id}
              label={job.name}
              help={
                <>
                  {job.description}
                  <JobScheduleSetting job={job} />
                  {job.id === "not-found-check" && <NotFoundHoursSetting initial={notFoundAfterHours} />}
                </>
              }
            >
              <RunJobButton jobId={job.id} />
            </SettingRow>
          ))}
        </SettingsGroup>
      </SettingsSection>
    </div>
  );
}
