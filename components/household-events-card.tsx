"use client";

import { useState } from "react";
import { saveHouseholdEventsAction } from "@/app/settings/notification-actions";
import type { HouseholdNotificationEvents } from "@/lib/api/types";
import { useT } from "@/lib/i18n/client";
import { showToast } from "@/components/toast";
import { SaveBar, SettingRow, SettingsGroup, SettingsGroupHeader } from "@/components/settings/settings-ui";
import { orError } from "@/lib/async/or-error";

/** Settings › Notifications › Household events: which events Discord,
 * ntfy, Telegram, Pushover, email and the webhook post — a row per event,
 * saved together. Everyone's own channels (Settings › Notifications ›
 * Personal) follow their own choices instead. */
export function HouseholdEventsCard({ initial }: { initial: HouseholdNotificationEvents["events"] }) {
  const t = useT();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initial.map((event) => [event.event, event.enabled])),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const changes = Object.fromEntries(
    saved.filter((event) => draft[event.event] !== event.enabled).map((event) => [event.event, draft[event.event]]),
  );
  const dirty = Object.keys(changes).length > 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    setError(null);
    const result = await orError(saveHouseholdEventsAction(changes), t("common.somethingWentWrong"));
    setSaving(false);
    if (result.error) {
      setError(result.error);
      showToast(result.error, "error");
      return;
    }
    if (result.data) {
      setSaved(result.data.events);
      setDraft(Object.fromEntries(result.data.events.map((event) => [event.event, event.enabled])));
    }
    showToast(t("common.saved"));
  }

  return (
    <form onSubmit={save}>
      <SettingsGroup>
        <SettingsGroupHeader title={t("integrations.householdEventsTitle")} description={t("integrations.householdEventsIntro")} />
        {saved.map((event) => {
          const id = `household-event-${event.event}`;
          return (
            <SettingRow key={event.event} label={event.label} htmlFor={id}>
              <input
                id={id}
                type="checkbox"
                checked={draft[event.event] ?? false}
                onChange={(e) => setDraft((current) => ({ ...current, [event.event]: e.target.checked }))}
                className="h-4 w-4 accent-accent"
              />
            </SettingRow>
          );
        })}
        <SaveBar
          label={t("common.save")}
          pendingLabel={t("common.saving")}
          pending={saving}
          disabled={!dirty}
          status={error && <span className="text-red-400">{error}</span>}
        />
      </SettingsGroup>
    </form>
  );
}
