"use client";

import Link from "next/link";
import { formatBytes } from "@/lib/format";
import { formatDate } from "@/lib/i18n/format";
import { storageForecastLine, storageFullOnLine } from "@/lib/library/storage";
import { useT } from "@/lib/i18n/client";
import type { DiskSpaceForecast } from "@/lib/integrations/disk-space-logic";

export type StorageCardData = {
  folders: { path: string; freeBytes: number; servers: string[] }[];
  totalFreeBytes: number;
  measuredAt: string | null;
  live: boolean;
  forecast: DiskSpaceForecast | null;
};

/** The Library page's Storage card: free space per root folder, which
 * servers use it, and the "full in N days" forecast from the daily
 * disk-space snapshots. */
export function LibraryStorageCard({
  overview,
  hasArr,
  isAdmin,
}: {
  overview: StorageCardData;
  /** Sonarr or Radarr is connected (root folders come from them). */
  hasArr: boolean;
  isAdmin: boolean;
}) {
  const t = useT();

  if (!hasArr && overview.folders.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-bg-1 px-6 py-5">
        <h2 className="font-display text-xl text-text-primary">{t("library.storageTitle")}</h2>
        <p className="mt-2 text-sm text-text-secondary">{isAdmin ? t("library.storageEmpty") : t("library.storageEmptyMember")}</p>
        {isAdmin && (
          <Link href="/settings/services" className="mt-3 inline-block text-sm text-accent hover:text-accent-hover">
            {t("discover.connectIntegration")}
          </Link>
        )}
      </div>
    );
  }

  const fullOn = storageFullOnLine(t, overview.forecast);

  return (
    <div className="rounded-2xl border border-border bg-bg-1 px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-xl text-text-primary">{t("library.storageTitle")}</h2>
        <span className="font-display text-2xl text-text-primary">
          {t("library.storageFreeTotal", { size: formatBytes(t, overview.totalFreeBytes) })}
        </span>
      </div>

      {overview.folders.length > 0 && (
        <ul className="mt-4 divide-y divide-border">
          {overview.folders.map((folder) => (
            <li key={folder.path} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="truncate font-mono text-xs text-text-primary" title={folder.path}>
                  {folder.path}
                </div>
                {folder.servers.length > 0 && <div className="text-xs text-text-muted">{folder.servers.join(" · ")}</div>}
              </div>
              <span className="text-text-secondary">{t("library.storageFree", { size: formatBytes(t, folder.freeBytes) })}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-sm text-text-secondary">
        {storageForecastLine(t, overview.forecast)}
        {fullOn && <span className="text-text-muted"> {fullOn}</span>}
      </p>
      {overview.measuredAt && (
        <p className="mt-1 text-xs text-text-muted">
          {overview.live
            ? t("library.storageLive")
            : t("library.storageSnapshot", { date: formatDate(t, new Date(overview.measuredAt), "medium") })}
        </p>
      )}
    </div>
  );
}
