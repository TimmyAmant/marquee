"use client";

import { useRouter } from "next/navigation";

export function YearSelect({
  currentYear,
  currentParams,
  basePath = "/discover",
}: {
  currentYear: string | undefined;
  currentParams: Record<string, string | undefined>;
  basePath?: string;
}) {
  const router = useRouter();
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - 1949 }, (_, i) => thisYear - i);

  function navigate(year: string) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(currentParams)) {
      if (value && key !== "year" && key !== "page") params.set(key, value);
    }
    if (year) params.set("year", year);
    const qs = params.toString();
    router.push(`${basePath}${qs ? `?${qs}` : ""}`);
  }

  return (
    <select
      value={currentYear ?? ""}
      onChange={(e) => navigate(e.target.value)}
      className="rounded-full border border-border bg-bg-0 px-3 py-1.5 text-xs text-text-secondary outline-none transition-colors hover:border-border-strong focus:border-accent"
    >
      <option value="">All years</option>
      {years.map((year) => (
        <option key={year} value={year}>
          {year}
        </option>
      ))}
    </select>
  );
}
