"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { PosterGrid } from "@/components/poster-grid";
import { PosterCard } from "@/components/poster-card";
import { StatusBadge } from "@/components/status-badge";
import { FavoriteButton } from "@/components/favorite-button";
import { ResolutionBadge, DynamicRangeBadge, AudioBadge } from "@/components/resolution-badge";
import { LibraryArrActions } from "@/components/library/library-arr-actions";
import { loadMoreLibraryAction } from "@/app/library/actions";
import { statusText } from "@/lib/library/status-tone";
import { libraryQueryParams, type LibraryQuery } from "@/lib/library/list";
import { formatBytes } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { Translator } from "@/lib/i18n/translator";
import type { LibraryEntry } from "@/lib/api/types";

/** Brand names, never translated. */
const SOURCE_LABELS = { plex: "Plex", jellyfin: "Jellyfin", sonarr: "Sonarr", radarr: "Radarr" } as const;

function metaLine(t: Translator, entry: LibraryEntry): string | undefined {
  const parts: string[] = [SOURCE_LABELS[entry.source]];
  if (entry.sizeBytes) parts.push(formatBytes(t, entry.sizeBytes));
  if (entry.mediaType === "tv" && entry.episodeCount) parts.push(t("library.countEpisodes", { count: entry.episodeCount }));
  if (entry.upgradeAvailable) parts.push(t("discover.upgradeAvailable"));
  if (entry.possibleDuplicate) parts.push(t("discover.possibleDuplicate"));
  return parts.join(" · ");
}

/**
 * The Library page's results: the first page from the server, then more as
 * the user scrolls (loadMoreLibraryAction, the same query). Mounted fresh
 * per query by the page's `key`, so a filter change starts over.
 */
export function LibraryResults({
  initialEntries,
  initialPage,
  totalPages,
  totalResults,
  query,
  view,
  isAdmin,
}: {
  initialEntries: LibraryEntry[];
  initialPage: number;
  totalPages: number;
  totalResults: number;
  query: LibraryQuery;
  view: "grid" | "table";
  isAdmin: boolean;
}) {
  const t = useT();
  const [entries, setEntries] = useState(initialEntries);
  const [page, setPage] = useState(initialPage);
  const [pages, setPages] = useState(totalPages);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasNextPage = page < pages;

  function loadMore() {
    if (!hasNextPage || isPending) return;
    const raw = Object.fromEntries(libraryQueryParams(query).entries());
    startTransition(async () => {
      try {
        const result = await loadMoreLibraryAction(raw, page + 1);
        setEntries((prev) => {
          const seen = new Set(prev.map((e) => `${e.mediaType}:${e.tmdbId}`));
          return [...prev, ...result.entries.filter((e) => !seen.has(`${e.mediaType}:${e.tmdbId}`))];
        });
        setPage(result.page);
        setPages(result.totalPages);
        setFailed(false);
      } catch {
        setFailed(true);
      }
    });
  }

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || failed) return;
    const observer = new IntersectionObserver(
      (observed) => {
        if (observed[0].isIntersecting) loadMore();
      },
      { rootMargin: "1200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // loadMore reads the latest state through closures on each observation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNextPage, failed, page, isPending]);

  if (entries.length === 0) {
    return <p className="text-sm text-text-muted">{t("discover.noFilterMatches")}</p>;
  }

  return (
    <div>
      <p className="mb-4 text-sm text-text-secondary">{t("common.titles", { count: totalResults })}</p>

      {view === "grid" ? (
        <PosterGrid>
          {entries.map((entry) => (
            <PosterCard
              key={`${entry.mediaType}-${entry.tmdbId}`}
              href={`/title/${entry.mediaType}/${entry.tmdbId}`}
              posterPath={entry.posterPath}
              name={entry.name}
              year={entry.year}
              meta={metaLine(t, entry)}
              badge={
                <div className="flex items-center gap-1.5">
                  {entry.status && <StatusBadge status={entry.status} compact />}
                  <ResolutionBadge qualityName={entry.quality} resolution={entry.resolution} />
                  <DynamicRangeBadge dynamicRange={entry.hdr} />
                </div>
              }
              status={entry.status ?? undefined}
              filePath={entry.filePath}
              favoriteAction={
                <FavoriteButton
                  entityType={entry.mediaType}
                  tmdbId={entry.tmdbId}
                  initialFavorited={entry.favorited ?? false}
                  compact
                />
              }
              quickAction={
                isAdmin && entry.arrTracking ? (
                  <div className="opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
                    <LibraryArrActions
                      mediaType={entry.mediaType}
                      tmdbId={entry.tmdbId}
                      tvdbId={entry.tvdbId}
                      monitored={entry.arrTracking.monitored}
                      compact
                    />
                  </div>
                ) : undefined
              }
            />
          ))}
        </PosterGrid>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-bg-1 text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t("discover.columnTitle")}</th>
                <th className="px-4 py-3 font-medium">{t("discover.columnYear")}</th>
                <th className="px-4 py-3 font-medium">{t("discover.columnQuality")}</th>
                <th className="px-4 py-3 font-medium">{t("discover.columnSize")}</th>
                <th className="px-4 py-3 font-medium">{t("library.columnStatus")}</th>
                <th className="px-4 py-3 font-medium">{t("discover.columnSource")}</th>
                {isAdmin && <th className="px-4 py-3 font-medium">{t("discover.columnLocation")}</th>}
                {isAdmin && <th className="px-4 py-3 font-medium">{t("library.columnActions")}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry) => (
                <tr key={`${entry.mediaType}-${entry.tmdbId}`} className="hover:bg-bg-1/60">
                  <td className="px-4 py-3">
                    <Link href={`/title/${entry.mediaType}/${entry.tmdbId}`} className="text-text-primary hover:text-accent">
                      {entry.name}
                    </Link>
                    {entry.mediaType === "tv" && entry.episodeCount ? (
                      <span className="ml-2 text-xs text-text-muted">{t("library.countEpisodes", { count: entry.episodeCount })}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{entry.year || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ResolutionBadge qualityName={entry.quality} resolution={entry.resolution} />
                      <DynamicRangeBadge dynamicRange={entry.hdr} />
                      {entry.videoCodec && (
                        <span className="inline-flex items-center rounded-full border border-border bg-untracked-bg px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                          {entry.videoCodec}
                        </span>
                      )}
                      <AudioBadge audioCodec={entry.audioCodec} />
                      {entry.upgradeAvailable && <span className="text-xs text-info">{t("discover.upgradeAvailable")}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{entry.sizeBytes ? formatBytes(t, entry.sizeBytes) : "—"}</td>
                  <td className="px-4 py-3">
                    {entry.status ? <StatusBadge status={entry.status} compact /> : <span className="text-text-secondary">{statusText(t, null).name}</span>}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{SOURCE_LABELS[entry.source]}</td>
                  {isAdmin && (
                    <td className="max-w-xs px-4 py-3 font-mono text-xs text-text-secondary">
                      <div className="truncate" title={entry.filePath ?? undefined}>
                        {entry.filePath || "—"}
                      </div>
                      {entry.possibleDuplicate && <div className="mt-0.5 text-red-400">{t("discover.possibleDuplicate")}</div>}
                    </td>
                  )}
                  {isAdmin && (
                    <td className="px-4 py-3">
                      {entry.arrTracking ? (
                        <LibraryArrActions
                          mediaType={entry.mediaType}
                          tmdbId={entry.tmdbId}
                          tvdbId={entry.tvdbId}
                          monitored={entry.arrTracking.monitored}
                        />
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasNextPage && (
        <div ref={sentinelRef} className="flex h-16 items-center justify-center gap-3 text-sm text-text-muted">
          {failed ? (
            <button
              type="button"
              onClick={() => {
                setFailed(false);
                loadMore();
              }}
              className="rounded-full border border-border-strong px-3.5 py-1.5 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent"
            >
              {t("common.retry")}
            </button>
          ) : isPending ? (
            t("discover.loadingMore")
          ) : (
            <button
              type="button"
              onClick={loadMore}
              className="rounded-full border border-border-strong px-3.5 py-1.5 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent"
            >
              {t("library.loadMore")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
