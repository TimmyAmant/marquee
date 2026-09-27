"use client";

import { useRouter } from "next/navigation";
import type { DiscoverSort } from "@/lib/tmdb/client";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translator";

const SORT_LABELS: Record<DiscoverSort, MessageKey> = {
  popularity: "discover.sortPopular",
  top_rated: "discover.sortTopRated",
  newest: "discover.sortNewest",
};

export function SortSelect({
  currentSort,
  currentParams,
  basePath,
}: {
  currentSort: DiscoverSort;
  currentParams: Record<string, string | undefined>;
  basePath: string;
}) {
  const t = useT();
  const router = useRouter();

  function navigate(sort: string) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(currentParams)) {
      if (value && key !== "sort" && key !== "page") params.set(key, value);
    }
    if (sort !== "popularity") params.set("sort", sort);
    const qs = params.toString();
    router.push(`${basePath}${qs ? `?${qs}` : ""}`);
  }

  return (
    <select
      value={currentSort}
      onChange={(e) => navigate(e.target.value)}
      className="rounded-full border border-border bg-bg-0 px-3 py-1.5 text-xs text-text-secondary outline-none transition-colors hover:border-border-strong focus:border-accent"
    >
      {(Object.keys(SORT_LABELS) as DiscoverSort[]).map((sort) => (
        <option key={sort} value={sort}>
          {t(SORT_LABELS[sort])}
        </option>
      ))}
    </select>
  );
}
