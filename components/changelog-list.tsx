"use client";

import { useState } from "react";
import type { ChangelogEntry } from "@/lib/changelog";
import { useT } from "@/lib/i18n/client";
import { formatDate } from "@/lib/i18n/format";
import type { Translator } from "@/lib/i18n/translator";

function daysAgo(t: Translator, dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.max(0, Math.floor(diffMs / 86_400_000));
  return t("nav.daysAgo", { count: days });
}

// The release notes themselves are English only (lib/changelog.ts); the
// chrome around them follows the page's language.
export function ChangelogList({ entries }: { entries: ChangelogEntry[] }) {
  const t = useT();
  const [openVersion, setOpenVersion] = useState<string | null>(null);
  const openEntry = entries.find((e) => e.version === openVersion) ?? null;

  return (
    <>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-1">
        {entries.map((entry, i) => (
          // Never wraps: on a phone the date sits under the version (like the
          // iPhone app's rows) so the button always stays on the right.
          <div key={entry.version} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4">
            <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row-reverse sm:items-center sm:justify-end sm:gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-display text-base text-text-primary">
                  {t("nav.releaseVersion", { version: entry.version })}
                </span>
                {i === 0 && (
                  <span className="shrink-0 rounded-full bg-owned-bg px-2.5 py-0.5 text-[11px] font-medium text-owned">
                    {t("nav.latest")}
                  </span>
                )}
              </div>
              <span className="text-xs text-text-muted">{daysAgo(t, entry.date)}</span>
            </div>
            <button
              type="button"
              onClick={() => setOpenVersion(entry.version)}
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-bg-0 transition-colors hover:bg-accent-hover"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path
                  d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v5h5M9 13h6M9 17h6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {t("nav.viewChangelog")}
            </button>
          </div>
        ))}
      </div>

      {openEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg-0/80 p-4 backdrop-blur-sm"
          onClick={() => setOpenVersion(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-bg-1 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-xl text-text-primary">
                  {t("nav.versionChangelog", { version: openEntry.version })}
                </h2>
                {/* A calendar day ("2026-09-26"), the same everywhere. */}
                <p className="mt-1 text-xs text-text-muted">
                  {formatDate(t, `${openEntry.date}T00:00:00Z`, "long", "UTC") || openEntry.date}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenVersion(null)}
                aria-label={t("common.close")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-secondary transition-colors hover:border-accent hover:text-accent"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <ul className="mt-5 flex flex-col gap-2.5 text-sm text-text-secondary">
              {openEntry.changes.map((change, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-text-muted">–</span>
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
