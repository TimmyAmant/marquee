import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getRecentActivity } from "@/lib/activity/query";
import type { ActivityEventType } from "@/lib/db/schema";
import { getT } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/format";
import { rich } from "@/lib/i18n/rich";
import type { MessageKey } from "@/lib/i18n/translator";
import { SettingsHeader, SettingsSection } from "@/components/settings/settings-ui";

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
      <SettingsHeader title={t("admin.activityTitle")} description={t("admin.activityIntro")} />

      <SettingsSection>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-1">
        {events.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-muted">{t("admin.activityNothingYet")}</p>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="flex flex-col gap-1 px-5 py-3.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4"
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
      </SettingsSection>
    </div>
  );
}
