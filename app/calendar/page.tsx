import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getArrCredential } from "@/lib/integrations/credentials";
import { getUpcomingReleases } from "@/lib/calendar/query";
import { PosterCard } from "@/components/poster-card";
import { PosterGrid } from "@/components/poster-grid";

const DAYS_AHEAD = 60;

function formatDateHeader(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export default async function CalendarPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id;
  const [radarrCred, sonarrCred] = await Promise.all([
    getArrCredential(userId, "radarr"),
    getArrCredential(userId, "sonarr"),
  ]);

  if (!radarrCred && !sonarrCred) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl text-text-primary">Calendar</h1>
        <p className="mt-3 text-text-secondary">
          Connect Sonarr or Radarr to see upcoming releases and air dates here.
        </p>
        <Link
          href="/settings/integrations"
          className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover"
        >
          Connect an integration
        </Link>
      </div>
    );
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + DAYS_AHEAD);

  const entries = await getUpcomingReleases(userId, start, end);

  const byDate = new Map<string, typeof entries>();
  for (const entry of entries) {
    const existing = byDate.get(entry.date);
    if (existing) existing.push(entry);
    else byDate.set(entry.date, [entry]);
  }
  const dates = [...byDate.keys()].sort();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="font-display text-3xl text-text-primary">Calendar</h1>
      <p className="mt-2 text-text-secondary">
        Upcoming releases and air dates for what you&apos;re monitoring, over the next {DAYS_AHEAD} days.
      </p>

      {dates.length === 0 ? (
        <p className="mt-10 text-text-secondary">Nothing on the calendar in this window.</p>
      ) : (
        <div className="mt-10 flex flex-col gap-10">
          {dates.map((date) => (
            <section key={date}>
              <h2 className="mb-4 font-display text-xl text-text-primary">{formatDateHeader(date)}</h2>
              <PosterGrid>
                {byDate.get(date)!.map((entry, i) => (
                  <PosterCard
                    key={`${entry.mediaType}-${entry.tmdbId}-${i}`}
                    href={`/title/${entry.mediaType}/${entry.tmdbId}`}
                    posterPath={entry.posterPath}
                    name={entry.name}
                    subtitle={entry.subtitle}
                  />
                ))}
              </PosterGrid>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
