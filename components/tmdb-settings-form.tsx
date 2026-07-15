"use client";

import { useActionState } from "react";
import { testAndSaveTmdbToken, disconnectTmdb } from "@/app/settings/integrations/tmdb-actions";

export function TmdbSettingsForm({
  savedInSettings,
  configuredFromEnv,
}: {
  savedInSettings: boolean;
  configuredFromEnv: boolean;
}) {
  const [state, formAction, isPending] = useActionState(testAndSaveTmdbToken, undefined);
  const [disconnectState, disconnectAction, isDisconnecting] = useActionState(
    disconnectTmdb,
    undefined,
  );

  const connected = state?.success ? true : disconnectState?.success ? false : savedInSettings;

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-xl text-text-primary">TMDb</h3>
          <p className="mt-1 text-xs text-text-muted">
            Shared for this whole Marquee instance, not just your account.
          </p>
        </div>
        {connected ? (
          <span className="rounded-full border border-owned/30 bg-owned-bg px-3 py-1 text-xs text-owned">
            Connected
          </span>
        ) : configuredFromEnv ? (
          <span className="rounded-full border border-border-strong px-3 py-1 text-xs text-text-secondary">
            Using environment variable
          </span>
        ) : null}
      </div>

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Access token
          <input
            type="password"
            name="accessToken"
            required
            placeholder={
              connected
                ? "•••••••••••••••• (enter to replace)"
                : "From themoviedb.org/settings/api"
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

      {savedInSettings && (
        <form action={disconnectAction} className="mt-3">
          <button
            type="submit"
            disabled={isDisconnecting}
            className="text-xs text-text-muted underline decoration-dotted hover:text-red-400 disabled:opacity-60"
          >
            {isDisconnecting ? "Removing…" : "Remove saved token"}
          </button>
          {disconnectState?.error && (
            <p className="mt-1 text-xs text-red-400">{disconnectState.error}</p>
          )}
        </form>
      )}
    </div>
  );
}
