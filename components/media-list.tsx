"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PosterCard } from "@/components/poster-card";
import { PosterGrid } from "@/components/poster-grid";
import { StatusBadge, type LibraryStatus } from "@/components/status-badge";
import { UnmonitorButton } from "@/components/unmonitor-button";
import { QuickAddButton } from "@/components/quick-add-button";
import { FavoriteButton } from "@/components/favorite-button";
import { formatBytes } from "@/lib/format";

export type MediaEntry = {
  titleId: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  name: string;
  posterPath: string | null;
  year: string | null;
  subtitle?: string | null;
  status?: LibraryStatus;
  source?: "plex" | "sonarr" | "radarr";
  sizeBytes?: number | null;
  addedAt?: string | null;
  monitored?: boolean | null;
};

type SortOrder = "newest" | "oldest" | "az" | "recent";
type TypeFilter = "all" | "movie" | "tv";
type StatusFilter = "all" | LibraryStatus;

const SORT_LABELS: Record<SortOrder, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  az: "A–Z",
  recent: "Recently added",
};

const SOURCE_LABELS: Record<NonNullable<MediaEntry["source"]>, string> = {
  plex: "Plex",
  sonarr: "Sonarr",
  radarr: "Radarr",
};

const TYPE_LABELS: Record<TypeFilter, string> = {
  all: "All",
  movie: "Movies",
  tv: "TV",
};

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All",
  owned: "Owned",
  tracked_downloading: "Downloading",
  tracked_monitored: "Missing",
  untracked: "Not owned",
};

// Only these are offered as filter chips — "untracked" rows never actually
// appear in the library (getUserLibrary drops them; see isDroppedArrRow), so
// showing it as a tab was always an empty dead end.
const VISIBLE_STATUS_FILTERS: StatusFilter[] = ["all", "owned", "tracked_downloading", "tracked_monitored"];

const VALID_SORT: SortOrder[] = ["newest", "oldest", "az", "recent"];
const VALID_TYPE: TypeFilter[] = ["all", "movie", "tv"];
const VALID_STATUS: StatusFilter[] = VISIBLE_STATUS_FILTERS;

function sortEntries(entries: MediaEntry[], order: SortOrder): MediaEntry[] {
  const sorted = [...entries];
  if (order === "az") {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }

  if (order === "recent") {
    sorted.sort((a, b) => {
      const aTime = a.addedAt ? new Date(a.addedAt).getTime() : null;
      const bTime = b.addedAt ? new Date(b.addedAt).getTime() : null;
      if (aTime === null && bTime === null) return 0;
      if (aTime === null) return 1;
      if (bTime === null) return -1;
      return bTime - aTime;
    });
    return sorted;
  }

  sorted.sort((a, b) => {
    const yearA = a.year ? Number(a.year) : null;
    const yearB = b.year ? Number(b.year) : null;
    if (yearA === null && yearB === null) return 0;
    if (yearA === null) return 1;
    if (yearB === null) return -1;
    return order === "newest" ? yearB - yearA : yearA - yearB;
  });
  return sorted;
}

function buildMeta(entry: MediaEntry): string | undefined {
  const parts: string[] = [];
  if (entry.source) parts.push(SOURCE_LABELS[entry.source]);
  if (entry.sizeBytes) parts.push(formatBytes(entry.sizeBytes));
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function MediaList({
  entries,
  subtitleLabel,
  itemLabel = "titles",
  showTypeFilter = false,
  showStatusFilter = false,
  showSearch = false,
  showUnmonitorAction = false,
  arrConfigured,
  emptyMessage = "Nothing found.",
  favoritedKeys,
  showFavorite = false,
}: {
  entries: MediaEntry[];
  subtitleLabel?: string;
  itemLabel?: string;
  showTypeFilter?: boolean;
  showStatusFilter?: boolean;
  showSearch?: boolean;
  showUnmonitorAction?: boolean;
  /** When provided, untracked titles get a quick "Add to Sonarr/Radarr" action. */
  arrConfigured?: { movie: boolean; tv: boolean };
  /** Shown when `entries` is empty — customize per page for a more specific,
   * actionable message than the generic default. */
  emptyMessage?: string;
  /** Keyed by `${mediaType}:${tmdbId}`, since a bare tmdbId can collide
   * between a movie and a TV show. */
  favoritedKeys?: Set<string>;
  showFavorite?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [view, setView] = useState<"grid" | "table">(
    searchParams.get("view") === "table" ? "table" : "grid",
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    const v = searchParams.get("sort");
    return VALID_SORT.includes(v as SortOrder) ? (v as SortOrder) : "newest";
  });
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(() => {
    const v = searchParams.get("type");
    return VALID_TYPE.includes(v as TypeFilter) ? (v as TypeFilter) : "all";
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const v = searchParams.get("status");
    return VALID_STATUS.includes(v as StatusFilter) ? (v as StatusFilter) : "all";
  });
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");

  function syncParam(key: string, value: string, defaultValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === defaultValue) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (typeFilter !== "all" && entry.mediaType !== typeFilter) return false;
      if (statusFilter !== "all" && entry.status !== statusFilter) return false;
      if (q && !entry.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, typeFilter, statusFilter, query]);

  // "Recently added" relies on `addedAt`, which is only ever populated for
  // Plex-sourced rows — for an arr-only library it would silently sort
  // everything to the back in insertion order, which isn't meaningful.
  const hasRecentData = useMemo(() => entries.some((e) => e.addedAt), [entries]);
  const effectiveSortOrder = sortOrder === "recent" && !hasRecentData ? "newest" : sortOrder;

  const sortedEntries = useMemo(
    () => sortEntries(filteredEntries, effectiveSortOrder),
    [filteredEntries, effectiveSortOrder],
  );

  if (entries.length === 0) {
    return <p className="text-sm text-text-muted">{emptyMessage}</p>;
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {sortedEntries.length} {itemLabel}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {showSearch && (
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                syncParam("q", e.target.value, "");
              }}
              placeholder="Search your library…"
              className="w-44 rounded-full border border-border bg-bg-0 px-3.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent"
            />
          )}

          {showTypeFilter && (
            <div className="flex gap-1 rounded-full border border-border p-1 text-xs">
              {(Object.keys(TYPE_LABELS) as TypeFilter[]).map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    setTypeFilter(type);
                    syncParam("type", type, "all");
                  }}
                  className={`rounded-full px-3 py-1 transition-colors ${
                    typeFilter === type
                      ? "bg-accent text-bg-0"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          )}

          {showStatusFilter && (
            <div className="flex gap-1 rounded-full border border-border p-1 text-xs">
              {VISIBLE_STATUS_FILTERS.map((status) => (
                <button
                  key={status}
                  onClick={() => {
                    setStatusFilter(status);
                    syncParam("status", status, "all");
                  }}
                  className={`rounded-full px-3 py-1 transition-colors ${
                    statusFilter === status
                      ? "bg-accent text-bg-0"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {STATUS_FILTER_LABELS[status]}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-1 rounded-full border border-border p-1 text-xs">
            {(Object.keys(SORT_LABELS) as SortOrder[])
              .filter((order) => order !== "recent" || hasRecentData)
              .map((order) => (
                <button
                  key={order}
                  onClick={() => {
                    setSortOrder(order);
                    syncParam("sort", order, "newest");
                  }}
                  className={`rounded-full px-3 py-1 transition-colors ${
                    effectiveSortOrder === order
                      ? "bg-accent text-bg-0"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {SORT_LABELS[order]}
                </button>
              ))}
          </div>

          <div className="flex gap-1 rounded-full border border-border p-1 text-xs">
            {(["grid", "table"] as const).map((v) => (
              <button
                key={v}
                onClick={() => {
                  setView(v);
                  syncParam("view", v, "grid");
                }}
                className={`rounded-full px-3 py-1 capitalize transition-colors ${
                  view === v
                    ? "bg-accent text-bg-0"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {sortedEntries.length === 0 ? (
        <p className="text-sm text-text-muted">No titles match these filters.</p>
      ) : view === "grid" ? (
        <PosterGrid>
          {sortedEntries.map((entry) => {
            const canUnmonitor =
              showUnmonitorAction &&
              entry.source !== "plex" &&
              (entry.status === "tracked_monitored" || entry.status === "tracked_downloading") &&
              entry.monitored !== false;

            const canQuickAdd =
              !canUnmonitor && !entry.status && arrConfigured?.[entry.mediaType];

            return (
              <PosterCard
                key={entry.titleId}
                href={`/title/${entry.mediaType}/${entry.tmdbId}`}
                posterPath={entry.posterPath}
                name={entry.name}
                year={entry.year}
                subtitle={entry.subtitle}
                meta={buildMeta(entry)}
                badge={entry.status && <StatusBadge status={entry.status} compact />}
                favoriteAction={
                  showFavorite && (
                    <FavoriteButton
                      entityType={entry.mediaType}
                      tmdbId={entry.tmdbId}
                      initialFavorited={favoritedKeys?.has(`${entry.mediaType}:${entry.tmdbId}`) ?? false}
                      compact
                    />
                  )
                }
                quickAction={
                  canUnmonitor ? (
                    <UnmonitorButton mediaType={entry.mediaType} tmdbId={entry.tmdbId} />
                  ) : canQuickAdd ? (
                    <QuickAddButton mediaType={entry.mediaType} tmdbId={entry.tmdbId} />
                  ) : undefined
                }
              />
            );
          })}
        </PosterGrid>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-bg-1 text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                {subtitleLabel && <th className="px-4 py-3 font-medium">{subtitleLabel}</th>}
                <th className="px-4 py-3 font-medium">Year</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedEntries.map((entry) => (
                <tr key={entry.titleId} className="hover:bg-bg-1/60">
                  <td className="px-4 py-3">
                    <a
                      href={`/title/${entry.mediaType}/${entry.tmdbId}`}
                      className="text-text-primary hover:text-accent"
                    >
                      {entry.name}
                    </a>
                  </td>
                  {subtitleLabel && (
                    <td className="px-4 py-3 text-text-secondary">{entry.subtitle || "—"}</td>
                  )}
                  <td className="px-4 py-3 text-text-secondary">{entry.year || "—"}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {entry.source ? SOURCE_LABELS[entry.source] : "—"}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {entry.sizeBytes ? formatBytes(entry.sizeBytes) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
