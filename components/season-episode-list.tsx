"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import { getSeasonEpisodesAction, type SeasonEpisodesResult } from "@/app/title/[type]/[id]/season-actions";
import type { TmdbSeasonSummary, TmdbEpisode } from "@/lib/tmdb/client";
import type { SeasonCompleteness } from "@/lib/integrations/status";

export function SeasonAccordion({
  seasons,
  tmdbId,
  tvdbId,
  completeness,
}: {
  seasons: TmdbSeasonSummary[];
  tmdbId: number;
  tvdbId: number | null;
  completeness?: SeasonCompleteness[];
}) {
  // Newest season first, matching Sonarr's own series-detail page.
  const real = [...seasons]
    .filter((s) => s.episode_count > 0)
    .sort((a, b) => b.season_number - a.season_number);

  const [openSeason, setOpenSeason] = useState<number | null>(real[0]?.season_number ?? null);
  const [cache, setCache] = useState<Map<number, SeasonEpisodesResult>>(new Map());
  const [isPending, startTransition] = useTransition();

  function loadSeason(seasonNumber: number) {
    if (cache.has(seasonNumber)) return;
    startTransition(async () => {
      const data = await getSeasonEpisodesAction(tmdbId, tvdbId, seasonNumber);
      setCache((prev) => new Map(prev).set(seasonNumber, data));
    });
  }

  useEffect(() => {
    if (openSeason != null) loadSeason(openSeason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (real.length === 0) return null;

  const completenessBySeason = new Map(completeness?.map((c) => [c.seasonNumber, c]));

  return (
    <div className="flex flex-col gap-2">
      {real.map((season) => {
        const stats = completenessBySeason.get(season.season_number);
        const isOpen = openSeason === season.season_number;
        const data = cache.get(season.season_number);
        const complete = stats && stats.total > 0 && stats.have >= stats.total;

        return (
          <div key={season.season_number} className="overflow-hidden rounded-xl border border-border">
            <button
              type="button"
              onClick={() => {
                const next = isOpen ? null : season.season_number;
                setOpenSeason(next);
                if (next != null) loadSeason(next);
              }}
              className="flex w-full items-center justify-between gap-3 bg-bg-1 px-4 py-3 text-left transition-colors hover:bg-bg-2"
            >
              <span className="text-sm font-medium text-text-primary">{season.name}</span>
              <div className="flex items-center gap-3">
                {stats && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      complete ? "bg-owned-bg text-owned" : "bg-tracked-bg text-tracked"
                    }`}
                  >
                    {stats.have}/{stats.total}
                  </span>
                )}
                <span
                  className={`text-text-secondary transition-transform ${isOpen ? "rotate-180" : ""}`}
                  aria-hidden
                >
                  ⌄
                </span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border p-3">
                {!data ? (
                  <p className="p-4 text-center text-sm text-text-muted">
                    {isPending ? "Loading…" : "No episode data for this season."}
                  </p>
                ) : (
                  <EpisodeList
                    episodes={data.episodes}
                    hasFileMap={new Map(Object.entries(data.hasFileMap).map(([k, v]) => [Number(k), v]))}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
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
          <div key={episode.id} className="flex gap-3 p-4 sm:gap-4">
            <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-bg-2 sm:w-32">
              {still && (
                <Image src={still} alt={episode.name} fill sizes="(min-width: 640px) 128px, 96px" className="object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 text-sm font-medium text-text-primary">
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
