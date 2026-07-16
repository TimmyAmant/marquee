"use client";

import { useActionState } from "react";
import { syncNowAction } from "@/app/settings/integrations/sync-actions";

export function SyncNowButton() {
  const [state, formAction, isPending] = useActionState(syncNowAction, undefined);

  return (
    <form action={formAction} className="flex items-center gap-3">
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
      >
        {isPending ? "Syncing…" : "Sync now"}
      </button>
      {state?.success && <span className="text-xs text-owned">Synced.</span>}
      {state?.error && <span className="text-xs text-red-400">{state.error}</span>}
      {state?.debug && <span className="text-xs text-text-muted">{state.debug}</span>}
    </form>
  );
}
