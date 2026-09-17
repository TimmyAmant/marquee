import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { invalid } from "@/lib/api/request";
import { localDateString } from "@/lib/api/mappers";
import { computeCalendarGrid, monthParam } from "@/lib/calendar/grid";
import { getUpcomingReleases } from "@/lib/calendar/query";
import { getArrCredential } from "@/lib/integrations/credentials";
import type { CalendarResponse } from "@/lib/api/types";

/** The Calendar page for one month (?month=YYYY-MM, default the current
 * month): Radarr release dates and Sonarr air dates from the library owner's
 * connections, covering the page's Sunday-to-Saturday grid. `configured` is
 * false (and `entries` empty) when neither Sonarr nor Radarr is connected. */
export const GET = withApi(async (request): Promise<CalendarResponse> => {
  const ctx = await requireApiUser(request);
  const monthQuery = new URL(request.url).searchParams.get("month");
  if (monthQuery && !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthQuery)) {
    throw invalid('"month" must look like 2026-09.');
  }

  const libraryOwnerId = await ctx.libraryOwnerId();
  const [radarrCred, sonarrCred] = await Promise.all([
    getArrCredential(libraryOwnerId, "radarr"),
    getArrCredential(libraryOwnerId, "sonarr"),
  ]);
  const configured = Boolean(radarrCred || sonarrCred);

  const grid = computeCalendarGrid(monthQuery, new Date());
  const entries = configured ? await getUpcomingReleases(libraryOwnerId, grid.gridStart, grid.gridEnd) : [];

  return {
    configured,
    month: monthParam(grid.year, grid.monthIndex),
    gridStart: localDateString(grid.gridStart),
    gridEnd: localDateString(grid.gridEnd),
    today: grid.todayKey,
    prevMonth: grid.prevMonth,
    nextMonth: grid.nextMonth,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    entries: entries.map((e) => ({
      date: e.date,
      mediaType: e.mediaType,
      tmdbId: e.tmdbId,
      name: e.name,
      posterPath: e.posterPath,
      subtitle: e.subtitle,
    })),
  };
});
