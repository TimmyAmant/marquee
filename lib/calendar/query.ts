import { arrConfig, listLibraryServers } from "@/lib/arr/servers";
import * as radarr from "@/lib/radarr/client";
import * as sonarr from "@/lib/sonarr/client";
import { resolveTmdbIdFromTvdbId } from "@/lib/tmdb/cross-reference";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { episodeDateKey } from "@/lib/calendar/grid";
import type { MediaType } from "@/lib/db/schema";

export type CalendarEntry = {
  date: string; // yyyy-mm-dd
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  subtitle: string;
};

function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function isWithin(iso: string, start: Date, end: Date): boolean {
  const time = new Date(iso).getTime();
  return time >= start.getTime() && time <= end.getTime();
}

// A movie can legitimately have more than one relevant date fall inside the
// requested window (e.g. hits theaters and becomes available digitally in
// the same month) — Radarr's /calendar only tells you the movie matched,
// not which field matched, so check each independently rather than picking
// just one and silently dropping the others.
const RADARR_DATE_LABELS: [keyof radarr.RadarrCalendarMovie, string][] = [
  ["inCinemas", "In theaters"],
  ["digitalRelease", "Digital release"],
  ["physicalRelease", "On disc"],
];

export async function getUpcomingReleases(
  userId: string,
  start: Date,
  end: Date,
): Promise<CalendarEntry[]> {
  // Every standard server's calendar, asked in parallel. A title on more
  // than one server would show twice, so entries are de-duplicated below.
  const [radarrServers, sonarrServers] = await Promise.all([
    listLibraryServers(userId, "radarr"),
    listLibraryServers(userId, "sonarr"),
  ]);
  const [movieLists, episodeLists] = await Promise.all([
    Promise.all(radarrServers.map((s) => radarr.getCalendar(arrConfig(s), start, end).catch(() => []))),
    Promise.all(sonarrServers.map((s) => sonarr.getCalendar(arrConfig(s), start, end).catch(() => []))),
  ]);

  const entries: CalendarEntry[] = [];

  {
    const movies = movieLists.flat();
    for (const movie of movies) {
      const title = await getOrFetchTitle("movie", movie.tmdbId).catch(() => null);
      for (const [field, label] of RADARR_DATE_LABELS) {
        const value = movie[field];
        if (typeof value === "string" && isWithin(value, start, end)) {
          entries.push({
            date: toDateOnly(value),
            mediaType: "movie",
            tmdbId: movie.tmdbId,
            name: movie.title,
            posterPath: title?.posterPath ?? null,
            subtitle: label,
          });
        }
      }
    }
  }

  {
    const episodes = episodeLists.flat();
    // A week of a daily show is a handful of episodes of the same series —
    // resolve each series' TMDb id and poster once per render, not once per
    // episode. The promise is cached so later episodes share the lookup.
    const seriesLookups = new Map<number, Promise<{ tmdbId: number; posterPath: string | null } | null>>();
    const lookupSeries = (tvdbId: number) => {
      let lookup = seriesLookups.get(tvdbId);
      if (!lookup) {
        lookup = (async () => {
          const tmdbId = await resolveTmdbIdFromTvdbId(tvdbId).catch(() => null);
          if (tmdbId == null) return null;
          const title = await getOrFetchTitle("tv", tmdbId).catch(() => null);
          return { tmdbId, posterPath: title?.posterPath ?? null };
        })();
        seriesLookups.set(tvdbId, lookup);
      }
      return lookup;
    };
    for (const episode of episodes) {
      if (!episode.series) continue;
      const date = episodeDateKey(episode);
      if (!date) continue;
      const series = await lookupSeries(episode.series.tvdbId);
      if (!series) continue;
      entries.push({
        date,
        mediaType: "tv",
        tmdbId: series.tmdbId,
        name: episode.series.title,
        posterPath: series.posterPath,
        subtitle: `S${String(episode.seasonNumber).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`,
      });
    }
  }

  const seen = new Set<string>();
  const unique = entries.filter((e) => {
    const key = `${e.date}|${e.mediaType}|${e.tmdbId}|${e.subtitle}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => a.date.localeCompare(b.date));
  return unique;
}
