"use client";

import { useState } from "react";
import { saveNotFoundAfterHoursAction } from "@/app/settings/jobs/actions";
import { useT } from "@/lib/i18n/client";
import { showToast } from "@/components/toast";
import { rich } from "@/lib/i18n/rich";
import { orError } from "@/lib/async/or-error";

/** Settings › Jobs, under the Can't Find Check: how many hours after
 * approval an unfound request is flagged. */
export function NotFoundHoursSetting({ initial }: { initial: number }) {
  const t = useT();
  const [value, setValue] = useState(String(initial));
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    const result = await orError(saveNotFoundAfterHoursAction(Number(value)), t("common.somethingWentWrong"));
    setBusy(false);
    if (result.error) {
      setMessage({ error: result.error });
      showToast(result.error, "error");
    } else if (result.afterHours !== undefined) {
      showToast(t("common.saved"));
      setSaved(result.afterHours);
      setValue(String(result.afterHours));
      setMessage({ ok: t("common.saved") });
    }
  }

  return (
    // A <span>, not a <div>: it sits inside the row's help text, a <p>.
    <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
      {/* One sentence with the box inside it, wherever the language puts it. */}
      <label className="flex flex-wrap items-center gap-2">
        {rich(t("requests.notFoundHoursSetting"), {
          field: () => (
            <input
              id="not-found-hours"
              type="number"
              min={1}
              max={720}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-16 rounded-lg border border-border bg-bg-0 px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
            />
          ),
        })}
      </label>
      {Number(value) !== saved && (
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-bg-0 hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? t("common.saving") : t("common.save")}
        </button>
      )}
      {message?.error && <span className="text-red-400">{message.error}</span>}
      {message?.ok && Number(value) === saved && <span className="text-owned">{message.ok}</span>}
    </span>
  );
}
