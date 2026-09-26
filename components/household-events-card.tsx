"use client";

import { useState } from "react";
import { saveHouseholdEventsAction } from "@/app/settings/notification-actions";
import type { HouseholdNotificationEvents } from "@/lib/api/types";

/** Settings › Integrations › Household channels: which events Discord,
 * ntfy, Telegram, Pushover, email and the webhook below post. Everyone's
 * own channels (Settings › Account) follow their own choices instead. */
export function HouseholdEventsCard({ initial }: { initial: HouseholdNotificationEvents["events"] }) {
  const [events, setEvents] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function toggle(event: string, enabled: boolean) {
    setSaving(true);
    setError(null);
    setEvents((current) => current.map((e) => (e.event === event ? { ...e, enabled } : e)));
    const result = await saveHouseholdEventsAction({ [event]: enabled });
    setSaving(false);
    if (result.data) setEvents(result.data.events);
    if (result.error) setError(result.error);
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-6">
      <h3 className="font-display text-xl text-text-primary">What the household channels post</h3>
      <p className="mt-1 text-xs text-text-muted">
        The channels below are the household&apos;s: everything picked here goes to each one that&apos;s set up, once.
        Members can add their own Telegram, Pushover, email, Discord, ntfy or webhook under Settings › Account ›
        Notifications, using the bot, app and mail server set up here.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {events.map((event) => (
          <li key={event.event}>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={event.enabled}
                onChange={(e) => toggle(event.event, e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              {event.label}
            </label>
          </li>
        ))}
      </ul>
      {(error || saving) && <p className={`mt-3 text-xs ${error ? "text-red-400" : "text-text-muted"}`}>{error ?? "Saving…"}</p>}
    </div>
  );
}
