"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { blockTitleAction, unblockTitleAction } from "@/lib/requests/blocklist-actions";
import type { MediaType } from "@/lib/db/schema";

/** The admin's "Block requests" / "Unblock requests" on a title page
 * (lib/requests/blocklist.ts). A title blocked by a keyword can only be
 * unblocked from Settings, where the keyword is. */
export function BlockRequestsButton({
  mediaType,
  tmdbId,
  blocked,
}: {
  mediaType: MediaType;
  tmdbId: number;
  blocked: { reason: string | null; keyword: string | null } | null;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (result.error) setError(result.error);
    else {
      setAsking(false);
      setReason("");
      router.refresh();
    }
  }

  const pill =
    "flex h-8 items-center rounded-full border border-border-strong px-3.5 text-[13px] text-text-secondary transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-60";

  if (blocked?.keyword) {
    return (
      <span className="flex h-8 items-center rounded-full border border-border px-3.5 text-[13px] text-text-muted">
        Requests blocked by “{blocked.keyword}”
      </span>
    );
  }
  if (blocked) {
    return (
      <button type="button" disabled={busy} onClick={() => run(() => unblockTitleAction(mediaType, tmdbId))} className={pill}>
        {busy ? "Unblocking…" : "Unblock requests"}
      </button>
    );
  }
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={pill}>
        Block requests
      </button>
    );
  }
  return (
    <span className="flex basis-full flex-wrap items-center gap-2">
      <input
        value={reason}
        maxLength={200}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why, for whoever asks (optional)"
        className="h-8 min-w-0 flex-1 rounded-full border border-border bg-bg-0 px-3.5 text-[13px] text-text-primary outline-none focus:border-accent"
      />
      <button type="button" disabled={busy} onClick={() => run(() => blockTitleAction(mediaType, tmdbId, reason))} className={pill}>
        {busy ? "Blocking…" : "Block"}
      </button>
      <button type="button" onClick={() => setAsking(false)} className="text-xs text-text-secondary hover:text-accent">
        Cancel
      </button>
      {error && <span className="basis-full text-xs text-red-400">{error}</span>}
    </span>
  );
}
