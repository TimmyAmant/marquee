"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import type { TmdbSeasonSummary, TmdbEpisode } from "@/lib/tmdb/client";
import type { SeasonCompleteness } from "@/lib/integrations/status";

export function SeasonSelector({
  seasons,
  selectedSeason,
  basePath,
  completeness,
}: {
  seasons: TmdbSeasonSummary[];
  selectedSeason: number;
  basePath: string;
  completeness?: SeasonCompleteness[];
}) {
  const router = useRouter();
  const real = seasons.filter((s) => s.episode_count > 0);
  if (real.length === 0) return null;

  const completenessBySeason = new Map(completeness?.map((c) => [c.seasonNumber, c]));

  return (
    <select
      value={selectedSeason}
      onChange={(e) => router.push(`${basePath}?season=${e.target.value}`)}
      className="rounded-full border border-border bg-bg-0 px-3.5 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent"
    >
      {real.map((season) => {
        const stats = completenessBySeason.get(season.season_number);
        return (
          <option key={season.season_number} value={season.season_number}>
            {season.name}
            {stats ? ` (${stats.have}/${stats.total})` : ""}
          </option>
        );
      })}
    </select>
  );
}

export function EpisodeList({
  episodes,
  hasFileMap,
}: {
  episodes: TmdbEpisode[];
  hasFileMap?: Map<number, boolean>;
}) {
  if (episodes.length === 0) {
    return <p className="text-sm text-text-muted">No episode data for this season.</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
      {episodes.map((episode) => {
        const still = tmdbImageUrl(episode.still_path, "w342");
        const hasFile = hasFileMap?.get(episode.episode_number);
        return (
          <div key={episode.id} className="flex gap-4 p-4">
            <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-bg-2">
              {still && (
                <Image src={still} alt={episode.name} fill sizes="128px" className="object-cover" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-text-primary">
                  {episode.episode_number}. {episode.name}
                </p>
                {hasFile !== undefined && (
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                      hasFile
                        ? "border-owned/30 bg-owned-bg text-owned"
                        : "border-border text-text-muted"
                    }`}
                  >
                    {hasFile ? "Have it" : "Missing"}
                  </span>
                )}
              </div>
              {episode.air_date && (
                <p className="mt-0.5 text-xs text-text-muted">{episode.air_date}</p>
              )}
              {episode.overview && (
                <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
                  {episode.overview.length > 220
                    ? `${episode.overview.slice(0, 220)}…`
                    : episode.overview}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
