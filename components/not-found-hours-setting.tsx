"use client";

import { useState } from "react";
import { saveNotFoundAfterHoursAction } from "@/app/settings/jobs/actions";

/** Settings › Jobs, under the Can't Find Check: how many hours after
 * approval an unfound request is flagged. */
export function NotFoundHoursSetting({ initial }: { initial: number }) {
  const [value, setValue] = useState(String(initial));
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    const result = await saveNotFoundAfterHoursAction(Number(value));
    setBusy(false);
    if (result.error) setMessage({ error: result.error });
    else if (result.afterHours !== undefined) {
      setSaved(result.afterHours);
      setValue(String(result.afterHours));
      setMessage({ ok: "Saved" });
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
      <label htmlFor="not-found-hours">Flag a request after</label>
      <input
        id="not-found-hours"
        type="number"
        min={1}
        max={720}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 rounded-lg border border-border bg-bg-0 px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
      />
      <span>hours without a find</span>
      {Number(value) !== saved && (
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-bg-0 hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      )}
      {message?.error && <span className="text-red-400">{message.error}</span>}
      {message?.ok && Number(value) === saved && <span className="text-owned">{message.ok}</span>}
    </div>
  );
}
