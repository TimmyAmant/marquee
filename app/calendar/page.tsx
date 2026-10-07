import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getArrCredential } from "@/lib/integrations/credentials";
import { getUpcomingReleases, type CalendarEntry } from "@/lib/calendar/query";
import { computeCalendarGrid, toDateKey } from "@/lib/calendar/grid";
import { groupDayEntries, type DayTitle } from "@/lib/calendar/group";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { getT } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/format";

const MAX_VISIBLE_PER_DAY = 4;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const viewer = await getViewerContext();
  if (!viewer.session) redirect("/login");
  const t = await getT();

  const isAdmin = viewer.isAdmin;
  const libraryOwnerId = viewer.libraryOwnerId;
  const [radarrCred, sonarrCred] = await Promise.all([
    getArrCredential(libraryOwnerId, "radarr"),
    getArrCredential(libraryOwnerId, "sonarr"),
  ]);

  if (!radarrCred && !sonarrCred) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl text-text-primary">{t("discover.calendarTitle")}</h1>
        <p className="mt-3 text-text-secondary">
          {isAdmin ? t("discover.calendarConnectAdmin") : t("discover.calendarConnectMember")}
        </p>
        {isAdmin && (
          <Link
            href="/settings/services"
            className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover"
          >
            {t("discover.connectIntegration")}
          </Link>
        )}
      </div>
    );
  }

  const { month: monthQuery } = await searchParams;
  // Grid math shared with GET /api/v1/calendar.
  const { monthIndex, firstOfMonth, gridStart, gridEnd, days, todayKey, prevMonth, nextMonth } =
    computeCalendarGrid(monthQuery, new Date());

  const entries = await getUpcomingReleases(libraryOwnerId, gridStart, gridEnd);
  const byDate = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const existing = byDate.get(entry.date);
    if (existing) existing.push(entry);
    else byDate.set(entry.date, [entry]);
  }

  return (
    <div className="mx-auto max-w-[1680px] px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-text-primary">{t("discover.calendarTitle")}</h1>
          <p className="mt-2 text-text-secondary">{formatDate(t, firstOfMonth, "monthYear")}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/calendar"
            className="rounded-full border border-border-strong px-3 py-1.5 text-text-primary transition-colors hover:border-accent hover:text-accent"
          >
            {t("discover.today")}
          </Link>
          <Link
            href={`/calendar?month=${prevMonth}`}
            className="rounded-full border border-border-strong px-3 py-1.5 text-text-primary transition-colors hover:border-accent hover:text-accent"
          >
            {t("discover.previousMonth")}
          </Link>
          <Link
            href={`/calendar?month=${nextMonth}`}
            className="rounded-full border border-border-strong px-3 py-1.5 text-text-primary transition-colors hover:border-accent hover:text-accent"
          >
            {t("discover.nextMonth")}
          </Link>
        </div>
      </div>

      {/* A 7-column grid can't shrink below a legible width — scroll it
          horizontally on narrow phones instead of squeezing every cell down
          to the point the day's entries become unreadable. */}
      <div className="mt-8 overflow-x-auto rounded-2xl border border-border">
        <div className="grid min-w-[760px] grid-cols-7 gap-px bg-border">
          {/* The grid's first week runs Sunday to Saturday: its days name the
              columns, in the reader's language. */}
          {days.slice(0, 7).map((day) => (
            <div key={day.getDay()} className="bg-bg-1 px-2 py-2.5 text-center text-sm font-semibold text-text-secondary">
              {new Intl.DateTimeFormat(t.tag, { weekday: "short" }).format(day)}
            </div>
          ))}

          {days.map((day) => {
            const key = toDateKey(day);
            const titles = groupDayEntries(byDate.get(key) ?? []);
            const inCurrentMonth = day.getMonth() === monthIndex;
            const isToday = key === todayKey;
            const visible = titles.slice(0, MAX_VISIBLE_PER_DAY);
            const overflow = titles.slice(MAX_VISIBLE_PER_DAY);

            return (
              <div
                key={key}
                className={`flex min-h-32 flex-col gap-1.5 p-2 sm:min-h-44 ${isToday ? "bg-bg-1" : "bg-bg-0"} ${
                  inCurrentMonth ? "" : "opacity-40"
                }`}
              >
                <span
                  className={`self-start rounded-full px-2 text-sm tabular-nums ${
                    isToday ? "bg-accent font-bold text-bg-0" : "font-medium text-text-secondary"
                  }`}
                >
                  {day.getDate()}
                </span>
                <div className="flex flex-1 flex-col gap-1">
                  {visible.map((title) => (
                    <CalendarRow key={`${title.first.mediaType}-${title.first.tmdbId}`} title={title} />
                  ))}
                  {/* "+N more" opens the rest in place: no JavaScript needed. */}
                  {overflow.length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer list-none px-1.5 text-xs font-medium text-accent group-open:hidden">
                        {t("discover.moreOnDay", { count: overflow.length })}
                      </summary>
                      <div className="flex flex-col gap-1">
                        {overflow.map((title) => (
                          <CalendarRow key={`${title.first.mediaType}-${title.first.tmdbId}`} title={title} />
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** One title on a day: its poster, name (two lines at most) and episode
 * code or release type beneath. */
function CalendarRow({ title }: { title: DayTitle<CalendarEntry> }) {
  const { first, subtitle } = title;
  const src = tmdbImageUrl(first.posterPath, "w92");
  return (
    <Link
      href={`/title/${first.mediaType}/${first.tmdbId}`}
      title={`${first.name} — ${subtitle}`}
      className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-bg-2"
    >
      {src ? (
        <Image src={src} alt="" width={26} height={39} className="h-[39px] w-[26px] shrink-0 rounded-[3px] object-cover" />
      ) : (
        <span className="h-[39px] w-[26px] shrink-0 rounded-[3px] bg-bg-2" />
      )}
      <span className="min-w-0">
        <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-text-primary">{first.name}</span>
        <span className="block truncate text-[11.5px] tabular-nums text-text-secondary">{subtitle}</span>
      </span>
    </Link>
  );
}
