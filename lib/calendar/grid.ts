// Pure month-grid math for the Calendar page — dependency-free so it can be
// unit tested, and shared with GET /api/v1/calendar so both cover exactly the
// same date range. Dates are in the server's local time zone, like the page.

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function monthParam(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export type CalendarGrid = {
  year: number;
  /** 0-based, like Date#getMonth. */
  monthIndex: number;
  firstOfMonth: Date;
  /** The Sunday on or before the 1st, at local midnight. */
  gridStart: Date;
  /** The Saturday on or after the last day of the month, at 23:59:59.999 local. */
  gridEnd: Date;
  days: Date[];
  todayKey: string;
  prevMonth: string;
  nextMonth: string;
};

/** `monthQuery` is the page's ?month=YYYY-MM; anything unparseable falls back
 * to the current month, the same as the page. */
export function computeCalendarGrid(monthQuery: string | undefined | null, now: Date): CalendarGrid {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  let year = today.getFullYear();
  let monthIndex = today.getMonth();
  if (monthQuery) {
    const [queryYear, queryMonth] = monthQuery.split("-").map(Number);
    if (Number.isFinite(queryYear) && Number.isFinite(queryMonth)) {
      year = queryYear;
      monthIndex = queryMonth - 1;
    }
  }

  const firstOfMonth = new Date(year, monthIndex, 1);
  const lastOfMonth = new Date(year, monthIndex + 1, 0);

  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const gridEnd = new Date(lastOfMonth);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));
  gridEnd.setHours(23, 59, 59, 999);

  const days: Date[] = [];
  for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  const prevMonthDate = new Date(year, monthIndex - 1, 1);
  const nextMonthDate = new Date(year, monthIndex + 1, 1);

  return {
    year,
    monthIndex,
    firstOfMonth,
    gridStart,
    gridEnd,
    days,
    todayKey: toDateKey(today),
    prevMonth: monthParam(prevMonthDate.getFullYear(), prevMonthDate.getMonth()),
    nextMonth: monthParam(nextMonthDate.getFullYear(), nextMonthDate.getMonth()),
  };
}

/** The calendar day an episode belongs on. Sonarr's `airDate` is already the
 * local air date, so prefer it; slicing `airDateUtc` instead would push an
 * evening US broadcast onto the next day. Without `airDate`, convert the UTC
 * instant to the server's local day, the same zone the grid is laid out in. */
export function episodeDateKey(episode: { airDate?: string | null; airDateUtc?: string | null }): string | null {
  if (episode.airDate && /^\d{4}-\d{2}-\d{2}$/.test(episode.airDate)) return episode.airDate;
  if (!episode.airDateUtc) return null;
  const instant = new Date(episode.airDateUtc);
  if (Number.isNaN(instant.getTime())) return null;
  return toDateKey(instant);
}
