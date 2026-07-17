import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getArrCredential } from "@/lib/integrations/credentials";
import { getUpcomingReleases, type CalendarEntry } from "@/lib/calendar/query";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import { getViewerContext } from "@/lib/integrations/library-owner";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE_PER_DAY = 4;

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthParam(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const viewer = await getViewerContext();
  if (!viewer.session) redirect("/login");

  const isAdmin = viewer.isAdmin;
  const libraryOwnerId = viewer.libraryOwnerId;
  const [radarrCred, sonarrCred] = await Promise.all([
    getArrCredential(libraryOwnerId, "radarr"),
    getArrCredential(libraryOwnerId, "sonarr"),
  ]);

  if (!radarrCred && !sonarrCred) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl text-text-primary">Calendar</h1>
        <p className="mt-3 text-text-secondary">
          {isAdmin
            ? "Connect Sonarr or Radarr to see upcoming releases and air dates here."
            : "The household admin hasn't connected Sonarr or Radarr yet."}
        </p>
        {isAdmin && (
          <Link
            href="/settings/integrations"
            className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover"
          >
            Connect an integration
          </Link>
        )}
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { month: monthQuery } = await searchParams;
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

  const entries = await getUpcomingReleases(libraryOwnerId, gridStart, gridEnd);
  const byDate = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const existing = byDate.get(entry.date);
    if (existing) existing.push(entry);
    else byDate.set(entry.date, [entry]);
  }

  const prevMonthDate = new Date(year, monthIndex - 1, 1);
  const nextMonthDate = new Date(year, monthIndex + 1, 1);
  const todayKey = toDateKey(today);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-text-primary">Calendar</h1>
          <p className="mt-2 text-text-secondary">
            {firstOfMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/calendar"
            className="rounded-full border border-border-strong px-3 py-1.5 text-text-primary transition-colors hover:border-accent hover:text-accent"
          >
            Today
          </Link>
          <Link
            href={`/calendar?month=${monthParam(prevMonthDate.getFullYear(), prevMonthDate.getMonth())}`}
            className="rounded-full border border-border-strong px-3 py-1.5 text-text-primary transition-colors hover:border-accent hover:text-accent"
          >
            ← Prev
          </Link>
          <Link
            href={`/calendar?month=${monthParam(nextMonthDate.getFullYear(), nextMonthDate.getMonth())}`}
            className="rounded-full border border-border-strong px-3 py-1.5 text-text-primary transition-colors hover:border-accent hover:text-accent"
          >
            Next →
          </Link>
        </div>
      </div>

      {/* A 7-column grid can't shrink below a legible width — scroll it
          horizontally on narrow phones instead of squeezing every cell down
          to the point the day's entries become unreadable. */}
      <div className="mt-8 overflow-x-auto rounded-2xl border border-border">
        <div className="grid min-w-[560px] grid-cols-7 gap-px bg-border">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="bg-bg-1 px-2 py-2 text-center text-xs font-medium text-text-secondary">
              {label}
            </div>
          ))}

          {days.map((day) => {
            const key = toDateKey(day);
            const dayEntries = byDate.get(key) ?? [];
            const inCurrentMonth = day.getMonth() === monthIndex;
            const isToday = key === todayKey;
            const visible = dayEntries.slice(0, MAX_VISIBLE_PER_DAY);
            const overflowCount = dayEntries.length - visible.length;

            return (
              <div
                key={key}
                className={`flex min-h-28 flex-col gap-1 bg-bg-0 p-1.5 sm:min-h-36 ${
                  inCurrentMonth ? "" : "opacity-40"
                }`}
              >
                <span
                  className={`self-start rounded-full px-1.5 text-xs ${
                    isToday ? "bg-accent font-medium text-bg-0" : "text-text-secondary"
                  }`}
                >
                  {day.getDate()}
                </span>
                <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                  {visible.map((entry, i) => {
                    const src = tmdbImageUrl(entry.posterPath, "w92");
                    return (
                      <Link
                        key={`${entry.mediaType}-${entry.tmdbId}-${i}`}
                        href={`/title/${entry.mediaType}/${entry.tmdbId}`}
                        title={`${entry.name} — ${entry.subtitle}`}
                        className="flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-bg-1"
                      >
                        {src && (
                          <Image
                            src={src}
                            alt=""
                            width={16}
                            height={24}
                            className="h-6 w-4 shrink-0 rounded-sm object-cover"
                          />
                        )}
                        <span className="truncate text-[11px] leading-tight text-text-primary">
                          {entry.name}
                        </span>
                      </Link>
                    );
                  })}
                  {overflowCount > 0 && (
                    <span className="px-1 text-[10px] text-text-secondary">+{overflowCount} more</span>
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
