"use client";

import { useRouter } from "next/navigation";

export function TypeSelect({
  currentType,
  currentParams,
  basePath,
}: {
  currentType: "movie" | "tv" | "all";
  currentParams: Record<string, string | undefined>;
  basePath: string;
}) {
  const router = useRouter();

  function navigate(type: string) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(currentParams)) {
      if (value && key !== "type" && key !== "genre" && key !== "page") params.set(key, value);
    }
    if (type !== "movie") params.set("type", type);
    const qs = params.toString();
    router.push(`${basePath}${qs ? `?${qs}` : ""}`);
  }

  return (
    <select
      value={currentType}
      onChange={(e) => navigate(e.target.value)}
      className="rounded-full border border-border bg-bg-0 px-3 py-1.5 text-xs text-text-secondary outline-none transition-colors hover:border-border-strong focus:border-accent"
    >
      <option value="movie">Movies</option>
      <option value="tv">TV</option>
      <option value="all">Both</option>
    </select>
  );
}
