"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_PAGE_SIZE,
  LIBRARY_RESOLUTIONS,
  LIBRARY_SORTS,
  LIBRARY_STATUS_FILTERS,
  libraryQueryParams,
  type LibraryFilterOptions,
  type LibraryQuery,
} from "@/lib/library/list";
import { statusText } from "@/lib/library/status-tone";
import { StatusLegend } from "@/components/status-legend";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translator";

const SORT_LABELS: Record<LibraryQuery["sort"], MessageKey> = {
  recent: "library.sortRecent",
  title: "library.sortTitle",
  year: "library.sortYear",
  size: "library.sortSize",
  rating: "library.sortRating",
};

/** Brand names, never translated. */
const SOURCE_LABELS = { plex: "Plex", jellyfin: "Jellyfin", sonarr: "Sonarr", radarr: "Radarr" } as const;

const selectClass =
  "max-w-[11rem] rounded-full border border-border bg-bg-0 px-3 py-1.5 text-xs text-text-secondary outline-none transition-colors hover:border-border-strong focus:border-accent";

/**
 * The Library page's filter bar. Every change goes into the address (page
 * 1 of the new selection), so the server renders the new first page and a
 * link to a filtered library can be shared. The search box waits a moment
 * after typing.
 */
export function LibraryFilters({
  query,
  options,
  view,
}: {
  query: LibraryQuery;
  options: LibraryFilterOptions;
  view: "grid" | "table";
}) {
  const t = useT();
  const router = useRouter();
  const [search, setSearch] = useState(query.q ?? "");

  function navigate(next: Partial<LibraryQuery>, nextView: "grid" | "table" = view) {
    const params = libraryQueryParams({ ...query, ...next, page: 1, pageSize: DEFAULT_PAGE_SIZE });
    if (nextView === "table") params.set("view", "table");
    const qs = params.toString();
    router.push(`/library${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === (query.q ?? "")) return;
    const handle = setTimeout(() => navigate({ q: trimmed || undefined }), 350);
    return () => clearTimeout(handle);
    // Only the typed text should re-arm the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters = Boolean(
    query.type || query.status || query.source || query.resolution || query.hdr || query.codec || query.genre || query.year !== undefined || query.q,
  );

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("discover.searchLibrary")}
        aria-label={t("discover.searchLibrary")}
        className="w-44 rounded-full border border-border bg-bg-0 px-3.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent"
      />

      <select
        aria-label={t("library.filterType")}
        value={query.type ?? ""}
        onChange={(e) => navigate({ type: (e.target.value || undefined) as LibraryQuery["type"] })}
        className={selectClass}
      >
        <option value="">{t("library.allTypes")}</option>
        <option value="movie">{t("common.movies")}</option>
        <option value="tv">{t("common.series")}</option>
      </select>

      <select
        aria-label={t("library.filterStatus")}
        value={query.status ?? ""}
        onChange={(e) => navigate({ status: (e.target.value || undefined) as LibraryQuery["status"] })}
        className={selectClass}
      >
        <option value="">{t("library.allStatuses")}</option>
        {LIBRARY_STATUS_FILTERS.map((status) => (
          <option key={status} value={status}>
            {statusText(t, status).name}
          </option>
        ))}
      </select>

      {options.sources.length > 1 && (
        <select
          aria-label={t("library.filterSource")}
          value={query.source ?? ""}
          onChange={(e) => navigate({ source: (e.target.value || undefined) as LibraryQuery["source"] })}
          className={selectClass}
        >
          <option value="">{t("library.allSources")}</option>
          {options.sources.map((source) => (
            <option key={source} value={source}>
              {SOURCE_LABELS[source]}
            </option>
          ))}
        </select>
      )}

      {options.resolutions.length > 0 && (
        <select
          aria-label={t("library.filterResolution")}
          value={query.resolution ?? ""}
          onChange={(e) => navigate({ resolution: (e.target.value || undefined) as LibraryQuery["resolution"] })}
          className={selectClass}
        >
          <option value="">{t("library.allResolutions")}</option>
          {LIBRARY_RESOLUTIONS.filter((r) => options.resolutions.includes(r)).map((resolution) => (
            <option key={resolution} value={resolution}>
              {resolution}
            </option>
          ))}
        </select>
      )}

      {options.hasHdr && (
        <button
          type="button"
          onClick={() => navigate({ hdr: query.hdr ? undefined : true })}
          aria-pressed={Boolean(query.hdr)}
          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
            query.hdr ? "border-accent bg-accent text-bg-0" : "border-border text-text-secondary hover:text-text-primary"
          }`}
        >
          {t("library.hdrOnly")}
        </button>
      )}

      {options.codecs.length > 0 && (
        <select
          aria-label={t("library.filterCodec")}
          value={query.codec ?? ""}
          onChange={(e) => navigate({ codec: e.target.value || undefined })}
          className={selectClass}
        >
          <option value="">{t("library.allCodecs")}</option>
          {options.codecs.map((codec) => (
            <option key={codec} value={codec}>
              {codec}
            </option>
          ))}
        </select>
      )}

      {options.genres.length > 0 && (
        <select
          aria-label={t("library.filterGenre")}
          value={query.genre ?? ""}
          onChange={(e) => navigate({ genre: e.target.value || undefined })}
          className={selectClass}
        >
          <option value="">{t("discover.allGenres")}</option>
          {options.genres.map((genre) => (
            <option key={genre} value={genre}>
              {genre}
            </option>
          ))}
        </select>
      )}

      {options.years.length > 0 && (
        <select
          aria-label={t("library.filterYear")}
          value={query.year ?? ""}
          onChange={(e) => navigate({ year: e.target.value ? Number(e.target.value) : undefined })}
          className={selectClass}
        >
          <option value="">{t("discover.allYears")}</option>
          {options.years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      )}

      <select
        aria-label={t("library.sortLabel")}
        value={query.sort}
        onChange={(e) => navigate({ sort: e.target.value as LibraryQuery["sort"] })}
        className={selectClass}
      >
        {LIBRARY_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {t(SORT_LABELS[sort])}
          </option>
        ))}
      </select>

      <div className="flex gap-1 rounded-full border border-border p-1 text-xs">
        {(["grid", "table"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => navigate({}, v)}
            aria-pressed={view === v}
            className={`rounded-full px-3 py-1 transition-colors ${
              view === v ? "bg-accent text-bg-0" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t(v === "grid" ? "discover.viewGrid" : "discover.viewTable")}
          </button>
        ))}
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            setSearch("");
            router.push(view === "table" ? "/library?view=table" : "/library", { scroll: false });
          }}
          className="rounded-full px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
        >
          {t("library.clearFilters")}
        </button>
      )}

      {view === "grid" && <StatusLegend />}
    </div>
  );
}
