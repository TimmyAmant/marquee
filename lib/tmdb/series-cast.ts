// A show's cast across every season (TMDb's aggregate_credits). Its plain
// `credits` are the latest season's only: Grey's Anatomy's listed 13 people
// and no Sandra Oh. Pure, so it's unit tested directly; lib/tmdb/client.ts
// folds it into the details it saves.

import type { TmdbCastMember, TmdbCrewMember } from "./client";

export type TmdbAggregateCastMember = {
  id: number;
  name: string;
  profile_path: string | null;
  order: number;
  total_episode_count?: number;
  roles?: { character?: string; episode_count?: number }[];
};

/** Kept with the details: far more than the page's Cast row shows, a small
 * part of a long-running show's thousands of guest stars. */
export const SERIES_CAST_KEPT = 60;

/** Set on a show's saved details once its cast is the whole series'. */
export const SERIES_CAST_MARKER = "marquee_series_cast";

/** The whole run's cast in TMDb's billing order, each with the character
 * they played most ("Cristina Yang"; two names when they played two). */
export function wholeSeriesCast(cast: TmdbAggregateCastMember[], limit = SERIES_CAST_KEPT): TmdbCastMember[] {
  return [...cast]
    .sort((a, b) => a.order - b.order)
    .slice(0, limit)
    .map((member) => {
      const characters = [...(member.roles ?? [])]
        .filter((role) => role.character?.trim())
        .sort((a, b) => (b.episode_count ?? 0) - (a.episode_count ?? 0))
        .map((role) => role.character!.trim());
      return {
        id: member.id,
        name: member.name,
        profile_path: member.profile_path,
        order: member.order,
        character: [...new Set(characters)].slice(0, 2).join(" / "),
      };
    });
}

export type TmdbAggregateCrewMember = {
  id: number;
  name: string;
  department: string;
  profile_path?: string | null;
  total_episode_count?: number;
  jobs?: { job?: string; episode_count?: number }[];
};

/** Crew jobs kept with the details, most episodes first. */
export const SERIES_CREW_KEPT = 80;

/** The whole run's crew, one entry per job, the people who worked on the
 * most episodes first: the page's Executive Producers include the
 * earlier seasons', not just the latest's. */
export function wholeSeriesCrew(crew: TmdbAggregateCrewMember[], limit = SERIES_CREW_KEPT): TmdbCrewMember[] {
  return crew
    .flatMap((member) =>
      (member.jobs ?? [])
        .filter((job) => job.job?.trim())
        .map((job) => ({
          episodes: job.episode_count ?? 0,
          entry: { id: member.id, name: member.name, job: job.job!.trim(), department: member.department } as TmdbCrewMember,
        })),
    )
    .sort((a, b) => b.episodes - a.episodes || a.entry.id - b.entry.id)
    .slice(0, limit)
    .map(({ entry }) => entry);
}
