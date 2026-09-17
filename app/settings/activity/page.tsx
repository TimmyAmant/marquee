import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getRecentActivity } from "@/lib/activity/query";
import { ACTIVITY_EVENT_VERBS as EVENT_VERBS } from "@/lib/pages/settings";

export default async function ActivitySettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/settings");

  const events = await getRecentActivity();

  return (
    <div>
      <h2 className="font-display text-xl text-text-primary">Activity</h2>
      <p className="mt-2 text-sm text-text-secondary">
        Who requested what, and who reviewed it — most recent first.
      </p>

      <div className="mt-6 flex flex-col gap-2">
        {events.length === 0 ? (
          <p className="text-sm text-text-muted">Nothing yet.</p>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-border bg-bg-1 px-4 py-3 text-sm"
            >
              <p className="text-text-primary">
                <span className="font-medium">{event.actorName || event.actorUsername}</span>{" "}
                <span className="text-text-secondary">{EVENT_VERBS[event.eventType]}</span>{" "}
                <Link
                  href={`/title/${event.mediaType}/${event.tmdbId}`}
                  className="text-text-primary hover:text-accent"
                >
                  {event.title}
                </Link>
              </p>
              <span className="shrink-0 text-xs text-text-muted">
                {new Date(event.createdAt).toLocaleString()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
