"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { blockKeywordAction, removeBlocklistEntryAction } from "@/lib/requests/blocklist-actions";
import type { BlocklistEntry } from "@/lib/api/types";

const inputClass =
  "rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent";

function RemoveButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await removeBlocklistEntryAction(id);
        setBusy(false);
        router.refresh();
      }}
      className="text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline disabled:opacity-60"
    >
      {busy ? "Removing…" : "Remove"}
    </button>
  );
}

/** Settings → Account (admin): what nobody may request — titles blocked from
 * their page, and keywords/genres added here. */
export function BlocklistSettings({ entries }: { entries: BlocklistEntry[] }) {
  const [state, formAction, isPending] = useActionState(blockKeywordAction, undefined);
  return (
    <div className="flex flex-col gap-4">
      {entries.length === 0 ? (
        <p className="px-6 pt-4 text-sm text-text-muted">Nothing blocked. Block a title from its page, or a keyword below.</p>
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
                    Keyword: <span className="font-medium">{entry.keyword}</span>
                  </span>
                )}
                {entry.reason && <p className="mt-0.5 truncate text-xs text-text-muted">{entry.reason}</p>}
              </div>
              <RemoveButton id={entry.id} />
            </li>
          ))}
        </ul>
      )}
      <form action={formAction} className="flex flex-col gap-3 border-t border-border px-6 py-4">
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Block a keyword or genre
          <input name="keyword" required placeholder="e.g. anime, reality, horror" className={inputClass} />
          <span className="text-xs text-text-muted">
            Any title with this TMDb keyword or genre can&apos;t be requested (you can still add it yourself).
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Reason (optional, shown to whoever asks)
          <input name="reason" maxLength={200} className={inputClass} />
        </label>
        {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? "Blocking…" : "Block"}
        </button>
      </form>
    </div>
  );
}
