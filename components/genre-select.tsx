"use client";

import { useRouter } from "next/navigation";

export function GenreSelect({
  currentGenre,
  currentParams,
  basePath,
  genres,
}: {
  currentGenre: number | undefined;
  currentParams: Record<string, string | undefined>;
  basePath: string;
  genres: { id: number; name: string }[];
}) {
  const router = useRouter();

  function navigate(genre: string) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(currentParams)) {
      if (value && key !== "genre" && key !== "page") params.set(key, value);
    }
    if (genre) params.set("genre", genre);
    const qs = params.toString();
    router.push(`${basePath}${qs ? `?${qs}` : ""}`);
  }

  return (
    <select
      value={currentGenre ?? ""}
      onChange={(e) => navigate(e.target.value)}
      className="rounded-full border border-border bg-bg-0 px-3 py-1.5 text-xs text-text-secondary outline-none transition-colors hover:border-border-strong focus:border-accent"
    >
      <option value="">All genres</option>
      {genres.map((genre) => (
        <option key={genre.id} value={genre.id}>
          {genre.name}
        </option>
      ))}
    </select>
  );
}
