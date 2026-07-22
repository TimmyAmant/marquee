import { redirect } from "next/navigation";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { RunJobButton } from "@/components/run-job-button";
import type { JobId } from "./actions";

const JOBS: { id: JobId; name: string; schedule: string; description: string }[] = [
  {
    id: "plex-sync",
    name: "Plex Library Sync",
    schedule: "Every hour",
    description: "Pulls the latest library state from every connected Plex server.",
  },
  {
    id: "jellyfin-sync",
    name: "Jellyfin Library Sync",
    schedule: "Every hour",
    description: "Pulls the latest library state from every connected Jellyfin server.",
  },
  {
    id: "arr-sync",
    name: "Sonarr/Radarr Sync",
    schedule: "Every hour",
    description: "Refreshes tracked/monitored status from every connected Sonarr and Radarr instance.",
  },
  {
    id: "disk-space-snapshot",
    name: "Disk Space Snapshot",
    schedule: "Daily at 3:00 AM",
    description: "Records free/used disk space for the storage forecast shown elsewhere in the app.",
  },
];

export default async function JobsSettingsPage() {
  const viewer = await getViewerContext();
  if (!viewer.session || !viewer.isAdmin) redirect("/settings");

  return (
    <div>
      <h2 className="font-display text-xl text-text-primary">Jobs</h2>
      <p className="mt-2 text-sm text-text-secondary">
        Marquee runs these maintenance tasks on a schedule — you can also trigger one manually
        below. Running a job now doesn&apos;t change its schedule.
      </p>

      <div className="mt-6 max-w-2xl overflow-hidden rounded-2xl border border-border bg-bg-1">
        <div className="divide-y divide-border">
          {JOBS.map((job) => (
            <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="text-sm font-medium text-text-primary">{job.name}</p>
                <p className="mt-0.5 text-xs text-text-muted">{job.description}</p>
                <p className="mt-1 text-xs text-text-secondary">{job.schedule}</p>
              </div>
              <RunJobButton jobId={job.id} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
