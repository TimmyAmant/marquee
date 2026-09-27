"use client";

import Link from "next/link";
import { MediaImage } from "@/components/media-image";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import { formatBytes } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { DuplicateGroup } from "@/lib/library/duplicates";

/** Brand names, never translated. */
const SOURCE_LABELS = { plex: "Plex", jellyfin: "Jellyfin", sonarr: "Sonarr", radarr: "Radarr" } as const;

/** The admin's Duplicates tab: each title with every copy's server, path,
 * size and quality, so the stale one can be found before anything is
 * deleted (Marquee deletes nothing itself). */
export function LibraryDuplicates({ groups }: { groups: DuplicateGroup[] }) {
  const t = useT();

  if (groups.length === 0) {
    return <p className="text-sm text-text-muted">{t("library.duplicatesEmpty")}</p>;
  }

  return (
    <div>
      <p className="mb-5 text-sm text-text-secondary">{t("library.duplicatesIntro")}</p>
      <div className="flex flex-col gap-4">
        {groups.map((group) => {
          const poster = tmdbImageUrl(group.posterPath, "w342");
          return (
            <section key={`${group.mediaType}-${group.tmdbId}`} className="rounded-2xl border border-border bg-bg-1 p-4">
              <div className="flex gap-4">
                <Link href={`/title/${group.mediaType}/${group.tmdbId}`} className="relative hidden h-24 w-16 shrink-0 overflow-hidden rounded-md bg-bg-2 ring-1 ring-border sm:block">
                  {poster && <MediaImage src={poster} alt={group.name} fill sizes="64px" className="object-cover" />}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <Link href={`/title/${group.mediaType}/${group.tmdbId}`} className="font-display text-lg text-text-primary hover:text-accent">
                      {group.name}
                    </Link>
                    {group.year && <span className="text-sm text-text-muted">{group.year}</span>}
                    <span className="rounded-full border border-red-400/40 bg-red-400/10 px-2 py-0.5 text-[11px] font-medium text-red-400">
                      {group.reason === "paths" ? t("library.reasonPaths") : t("library.reasonServers")}
                    </span>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    {/* Fixed column widths, so Server, Location, Size and Quality
                        line up from one title to the next. */}
                    <table className="w-full min-w-[560px] table-fixed text-left text-sm">
                      <colgroup>
                        <col className="w-44" />
                        <col />
                        <col className="w-24" />
                        <col className="w-32" />
                      </colgroup>
                      <thead className="text-xs text-text-muted">
                        <tr>
                          <th className="pb-1.5 pr-4 font-medium">{t("library.columnServer")}</th>
                          <th className="pb-1.5 pr-4 font-medium">{t("discover.columnLocation")}</th>
                          <th className="pb-1.5 pr-4 font-medium">{t("discover.columnSize")}</th>
                          <th className="pb-1.5 font-medium">{t("discover.columnQuality")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {group.copies.map((copy, index) => (
                          <tr key={index}>
                            <td className="truncate py-1.5 pr-4 text-text-primary">
                              {copy.server}
                              <span className="ml-1.5 text-xs text-text-muted">{SOURCE_LABELS[copy.source]}</span>
                            </td>
                            <td className="py-1.5 pr-4 font-mono text-xs text-text-secondary">
                              <div className="truncate" title={copy.filePath ?? undefined}>
                                {copy.filePath || "—"}
                              </div>
                            </td>
                            <td className="py-1.5 pr-4 text-text-secondary">{copy.sizeBytes ? formatBytes(t, copy.sizeBytes) : "—"}</td>
                            <td className="py-1.5 text-text-secondary">{copy.quality || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
