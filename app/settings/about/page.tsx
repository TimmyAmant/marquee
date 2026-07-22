import packageJson from "@/package.json";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { getUserLibrary, summarizeLibrary } from "@/lib/library/query";
import { getTotalRequestCount } from "@/lib/requests/query";

const REPO_URL = "https://github.com/TimmyAmant/marquee";

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className="font-mono text-text-primary">{value}</span>
    </div>
  );
}

function LinkRow({ label, href }: { label: string; href: string }) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="flex items-center justify-between gap-3 px-5 py-3 text-sm text-text-secondary transition-colors hover:bg-bg-2 hover:text-accent"
    >
      <span>{label}</span>
      <span aria-hidden>→</span>
    </a>
  );
}

export default async function AboutSettingsPage() {
  const viewer = await getViewerContext();
  const [library, totalRequests] = await Promise.all([
    viewer.libraryOwnerId ? getUserLibrary(viewer.libraryOwnerId) : Promise.resolve([]),
    getTotalRequestCount(),
  ]);
  const summary = summarizeLibrary(library);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div>
      <h2 className="font-display text-xl text-text-primary">About Marquee</h2>
      <p className="mt-2 text-sm text-text-secondary">Version, library stats, and where to get help.</p>

      <div className="mt-6 max-w-md overflow-hidden rounded-2xl border border-border bg-bg-1">
        <div className="divide-y divide-border">
          <StatRow label="Version" value={`v${packageJson.version}`} />
          <StatRow label="Movies" value={String(summary.movieCount)} />
          <StatRow label="TV Shows" value={String(summary.tvCount)} />
          <StatRow label="Tracked (not yet owned)" value={String(summary.trackedCount)} />
          <StatRow label="Total Requests" value={String(totalRequests)} />
          <StatRow label="Time Zone" value={timeZone} />
        </div>
      </div>

      <h2 className="mt-10 font-display text-xl text-text-primary">Getting Support</h2>
      <div className="mt-6 max-w-md overflow-hidden rounded-2xl border border-border bg-bg-1">
        <div className="divide-y divide-border">
          <LinkRow label="Changelog" href="/changelog" />
          <LinkRow label="Error reference" href="/help/errors" />
          <LinkRow label="GitHub" href={REPO_URL} />
          <LinkRow label="Report an issue" href={`${REPO_URL}/issues`} />
        </div>
      </div>
    </div>
  );
}
