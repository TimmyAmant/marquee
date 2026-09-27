import { redirect } from "next/navigation";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { RunJobButton } from "@/components/run-job-button";
import { jobDefinitions } from "@/lib/jobs/registry";
import { getT } from "@/lib/i18n/server";
import { NotFoundHoursSetting } from "@/components/not-found-hours-setting";
import { getNotFoundAfterHours } from "@/lib/requests/not-found";
import { SettingRow, SettingsGroup, SettingsHeader, SettingsSection } from "@/components/settings/settings-ui";

export default async function JobsSettingsPage() {
  const viewer = await getViewerContext();
  if (!viewer.session || !viewer.isAdmin) redirect("/settings");
  const notFoundAfterHours = await getNotFoundAfterHours();
  const t = await getT();

  return (
    <div>
      <SettingsHeader title={t("admin.jobsTitle")} description={t("admin.jobsIntro")} />

      <SettingsSection>
        <SettingsGroup>
          {jobDefinitions(t).map((job) => (
            <SettingRow
              key={job.id}
              label={job.name}
              help={
                <>
                  {job.description}
                  <span className="mt-1 block text-xs text-text-muted">{job.schedule}</span>
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
