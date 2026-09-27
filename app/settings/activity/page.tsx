import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getRecentActivity } from "@/lib/activity/query";
import type { ActivityEventType } from "@/lib/db/schema";
import { getT } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/format";
import { rich } from "@/lib/i18n/rich";
import type { MessageKey } from "@/lib/i18n/translator";

/** "Anna requested Dune" — who did it and the title marked up by the
 * message, so each language puts them where its grammar wants. */
const EVENT_MESSAGES: Record<ActivityEventType, MessageKey> = {
  request_created: "admin.activityRequestCreated",
  request_approved: "admin.activityRequestApproved",
  request_rejected: "admin.activityRequestRejected",
  request_manually_approved: "admin.activityRequestManuallyApproved",
};

export default async function ActivitySettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/settings");

  const events = await getRecentActivity();
  const t = await getT();

  return (
    <div>
      <h2 className="font-display text-xl text-text-primary">{t("admin.activityTitle")}</h2>
      <p className="mt-2 text-sm text-text-secondary">{t("admin.activityIntro")}</p>

      <div className="mt-6 flex flex-col gap-2">
        {events.length === 0 ? (
          <p className="text-sm text-text-muted">{t("admin.activityNothingYet")}</p>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-border bg-bg-1 px-4 py-3 text-sm"
            >
              <p className="text-text-secondary">
                {rich(
                  t(EVENT_MESSAGES[event.eventType], {
                    name: event.actorName || event.actorUsername,
                    title: event.title,
                  }),
                  {
                    who: (chunks) => <span className="font-medium text-text-primary">{chunks}</span>,
                    title: (chunks) => (
                      <Link
                        href={`/title/${event.mediaType}/${event.tmdbId}`}
                        className="text-text-primary hover:text-accent"
                      >
                        {chunks}
                      </Link>
                    ),
                  },
                )}
              </p>
              <span className="shrink-0 text-xs text-text-muted">{formatDate(t, event.createdAt, "full")}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
