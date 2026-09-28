import { getViewerContext } from "@/lib/integrations/library-owner";
import { FEATURES_URL, loadAboutPage, REPO_URL } from "@/lib/pages/settings";
import { getT } from "@/lib/i18n/server";
import { formatNumber } from "@/lib/i18n/format";
import { latestReleaseVersion, updateStatus } from "@/lib/updates/latest-release";
import { SettingRow, SettingsGroup, SettingsHeader, SettingsSection, SettingValue } from "@/components/settings/settings-ui";

function LinkRow({ label, href }: { label: string; href: string }) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm text-text-primary transition-colors hover:bg-bg-2 hover:text-accent"
    >
      <span>{label}</span>
      <span aria-hidden className="text-text-muted">
        {external ? "↗" : "→"}
      </span>
    </a>
  );
}

export default async function AboutSettingsPage() {
  const viewer = await getViewerContext();
  // Shared with GET /api/v1/settings/about.
  const [{ version, summary, totalRequests, timeZone }, latest, t] = await Promise.all([
    loadAboutPage(viewer),
    latestReleaseVersion(),
    getT(),
  ]);
  const update = updateStatus(version, latest);

  return (
    <div>
      <SettingsHeader title={t("admin.aboutTitle")} description={t("admin.aboutIntro")} />

      <SettingsSection title={t("settings.aboutMarqueeHeading")}>
        <SettingsGroup>
          <SettingRow label={t("admin.version")}>
            <SettingValue mono>{`v${version}`}</SettingValue>
          </SettingRow>
          <SettingRow
            label={t("settings.updatesLabel")}
            help={
              update.kind === "available"
                ? t("settings.updateAvailableHelp")
                : update.kind === "current"
                  ? t("settings.updateCurrentHelp")
                  : t("settings.updateUnknownHelp")
            }
          >
            {update.kind === "available" ? (
              <a
                href={`${REPO_URL}/releases/latest`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/25"
              >
                {t("settings.updateAvailable", { version: update.latest })}
              </a>
            ) : update.kind === "current" ? (
              <span className="rounded-full border border-owned/30 bg-owned-bg px-3 py-1 text-xs text-owned">
                {t("settings.updateCurrent")}
              </span>
            ) : (
              <span className="text-xs text-text-muted">—</span>
            )}
          </SettingRow>
          <SettingRow label={t("admin.timeZone")}>
            <SettingValue mono>{timeZone}</SettingValue>
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title={t("settings.aboutLibraryHeading")}>
        <SettingsGroup>
          <SettingRow label={t("common.movies")}>
            <SettingValue mono>{formatNumber(t, summary.movieCount)}</SettingValue>
          </SettingRow>
          <SettingRow label={t("common.tvShows")}>
            <SettingValue mono>{formatNumber(t, summary.tvCount)}</SettingValue>
          </SettingRow>
          <SettingRow label={t("admin.trackedNotOwned")}>
            <SettingValue mono>{formatNumber(t, summary.trackedCount)}</SettingValue>
          </SettingRow>
          <SettingRow label={t("admin.totalRequests")}>
            <SettingValue mono>{formatNumber(t, totalRequests)}</SettingValue>
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title={t("admin.gettingSupport")}>
        <SettingsGroup>
          <LinkRow label={t("admin.allFeatures")} href={FEATURES_URL} />
          <LinkRow label={t("admin.changelog")} href="/changelog" />
          <LinkRow label={t("admin.colorsMeaning")} href="/help/colors" />
          <LinkRow label={t("admin.errorReference")} href="/help/errors" />
          <LinkRow label="GitHub" href={REPO_URL} />
          <LinkRow label={t("admin.reportIssue")} href={`${REPO_URL}/issues`} />
        </SettingsGroup>
      </SettingsSection>
    </div>
  );
}
