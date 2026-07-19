"use client";

import { useActionState } from "react";
import { testAndSaveTvdbApiKey, disconnectTvdb } from "@/app/settings/integrations/tvdb-actions";

export function TvdbConnectCard({ connected }: { connected: boolean }) {
  const [state, formAction, isPending] = useActionState(testAndSaveTvdbApiKey, undefined);
  const [disconnectState, disconnectAction, isDisconnecting] = useActionState(
    disconnectTvdb,
    undefined,
  );

  const isConnected = state?.success ? true : disconnectState?.success ? false : connected;

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-xl text-text-primary">TheTVDB</h3>
          <p className="mt-1 text-xs text-text-muted">
            Fills in poster art and an overview for TV shows when TMDb doesn&apos;t have them yet —
            Sonarr&apos;s own metadata comes from here too.
          </p>
        </div>
        {isConnected && (
          <span className="rounded-full border border-owned/30 bg-owned-bg px-3 py-1 text-xs text-owned">
            Connected
          </span>
        )}
      </div>

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          API key
          <input
            type="password"
            name="apiKey"
            required
            placeholder={
              isConnected
                ? "•••••••••••••••• (enter to replace)"
                : "From thetvdb.com/dashboard/account/apikey"
            }
            className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
          />
        </label>

        {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
        {state?.success && <p className="text-sm text-owned">Connected successfully.</p>}

        <button
          type="submit"
          disabled={isPending}
          className="mt-1 self-start rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? "Testing…" : "Test & save"}
        </button>
      </form>

      {isConnected && (
        <form action={disconnectAction} className="mt-3">
          <button
            type="submit"
            disabled={isDisconnecting}
            className="text-xs text-text-muted underline decoration-dotted hover:text-red-400 disabled:opacity-60"
          >
            {isDisconnecting ? "Removing…" : "Remove saved key"}
          </button>
          {disconnectState?.error && (
            <p className="mt-1 text-xs text-red-400">{disconnectState.error}</p>
          )}
        </form>
      )}
    </div>
  );
}
