"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { blockKeywordAction, removeBlocklistEntryAction } from "@/lib/requests/blocklist-actions";
import type { BlocklistEntry } from "@/lib/api/types";
import { useT } from "@/lib/i18n/client";
import { rich } from "@/lib/i18n/rich";

const inputClass =
  "rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent";

function RemoveButton({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex shrink-0 flex-col items-end">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await removeBlocklistEntryAction(id);
          setBusy(false);
          if (result.error) setError(result.error);
          else router.refresh();
        }}
        className="text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline disabled:opacity-60"
      >
        {busy ? t("settings.removing") : t("common.remove")}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}

/** Settings → Account (admin): what nobody may request — titles blocked from
 * their page, and keywords/genres added here. */
export function BlocklistSettings({ entries }: { entries: BlocklistEntry[] }) {
  const t = useT();
  const [state, formAction, isPending] = useActionState(blockKeywordAction, undefined);
  return (
    <div className="flex flex-col gap-4">
      {entries.length === 0 ? (
        <p className="px-6 pt-4 text-sm text-text-muted">{t("settings.blocklistEmpty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 px-6 py-3 text-sm">
              <div className="min-w-0">
                {entry.kind === "title" && entry.mediaType && entry.tmdbId ? (
                  <Link href={`/title/${entry.mediaType}/${entry.tmdbId}`} className="text-text-primary hover:text-accent">
                    {entry.title ?? `#${entry.tmdbId}`}
                  </Link>
                ) : (
                  <span className="text-text-primary">
                    {rich(t("settings.blocklistKeyword", { keyword: entry.keyword ?? "" }), {
                      b: (chunks) => <span className="font-medium">{chunks}</span>,
                    })}
                  </span>
                )}
                {entry.reason && <p className="mt-0.5 truncate text-xs text-text-muted">{entry.reason}</p>}
              </div>
              <RemoveButton id={entry.id} />
            </li>
          ))}
        </ul>
      )}
      {/* Keyed on the list, so a successful add clears the fields. */}
      <form key={entries.length} action={formAction} className="flex flex-col gap-3 border-t border-border px-6 py-4">
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("settings.blockKeywordLabel")}
          <input name="keyword" required placeholder={t("settings.blockKeywordPlaceholder")} className={inputClass} />
          <span className="text-xs text-text-muted">{t("settings.blockKeywordHelp")}</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("settings.blockReasonLabel")}
          <input name="reason" maxLength={200} className={inputClass} />
        </label>
        {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? t("settings.blocking") : t("settings.block")}
        </button>
      </form>
    </div>
  );
}
