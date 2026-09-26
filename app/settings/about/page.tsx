import { getViewerContext } from "@/lib/integrations/library-owner";
import { loadAboutPage, REPO_URL } from "@/lib/pages/settings";
import { getT } from "@/lib/i18n/server";
import { formatNumber } from "@/lib/i18n/format";

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
  // Shared with GET /api/v1/settings/about.
  const { version, summary, totalRequests, timeZone } = await loadAboutPage(viewer);
  const t = await getT();

  return (
    <div>
      <h2 className="font-display text-xl text-text-primary">{t("admin.aboutTitle")}</h2>
      <p className="mt-2 text-sm text-text-secondary">{t("admin.aboutIntro")}</p>

      <div className="mt-6 max-w-md overflow-hidden rounded-2xl border border-border bg-bg-1">
        <div className="divide-y divide-border">
          <StatRow label={t("admin.version")} value={`v${version}`} />
          <StatRow label={t("common.movies")} value={formatNumber(t, summary.movieCount)} />
          <StatRow label={t("common.tvShows")} value={formatNumber(t, summary.tvCount)} />
          <StatRow label={t("admin.trackedNotOwned")} value={formatNumber(t, summary.trackedCount)} />
          <StatRow label={t("admin.totalRequests")} value={formatNumber(t, totalRequests)} />
          <StatRow label={t("admin.timeZone")} value={timeZone} />
        </div>
      </div>

      <h2 className="mt-10 font-display text-xl text-text-primary">{t("admin.gettingSupport")}</h2>
      <div className="mt-6 max-w-md overflow-hidden rounded-2xl border border-border bg-bg-1">
        <div className="divide-y divide-border">
          <LinkRow label={t("admin.changelog")} href="/changelog" />
          <LinkRow label={t("admin.colorsMeaning")} href="/help/colors" />
          <LinkRow label={t("admin.errorReference")} href="/help/errors" />
          <LinkRow label="GitHub" href={REPO_URL} />
          <LinkRow label={t("admin.reportIssue")} href={`${REPO_URL}/issues`} />
        </div>
      </div>
    </div>
  );
}
