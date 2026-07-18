"use client";

import { useActionState } from "react";
import {
  testAndSaveTraktClientId,
  disconnectTrakt,
  importTraktListAction,
} from "@/app/settings/integrations/trakt-actions";

export function TraktConnectCard({ connected }: { connected: boolean }) {
  const [state, formAction, isPending] = useActionState(testAndSaveTraktClientId, undefined);
  const [disconnectState, disconnectAction, isDisconnecting] = useActionState(
    disconnectTrakt,
    undefined,
  );
  const [importState, importFormAction, isImporting] = useActionState(
    importTraktListAction,
    undefined,
  );

  const isConnected = state?.success ? true : disconnectState?.success ? false : connected;

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-xl text-text-primary">Trakt</h3>
          <p className="mt-1 text-xs text-text-muted">
            Import a public Trakt list or watchlist as requests — doesn&apos;t require Trakt
            sign-in, just a free API app.
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
          Client ID
          <input
            type="password"
            name="clientId"
            required
            placeholder={
              isConnected
                ? "•••••••••••••••• (enter to replace)"
                : "From a Trakt API app at trakt.tv/oauth/applications"
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
            {isDisconnecting ? "Removing…" : "Remove saved client ID"}
          </button>
          {disconnectState?.error && (
            <p className="mt-1 text-xs text-red-400">{disconnectState.error}</p>
          )}
        </form>
      )}

      {isConnected && (
        <form action={importFormAction} className="mt-5 flex flex-col gap-3 border-t border-border pt-5">
          <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
            Import a list
            <input
              type="url"
              name="url"
              required
              placeholder="https://trakt.tv/users/username/lists/best-of-2024"
              className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
            />
          </label>
          <p className="text-xs text-text-muted">
            Also works with a watchlist URL (e.g. .../users/username/watchlist). The list must be
            public on Trakt&apos;s side. Matching titles not already owned or requested get added
            to your pending Requests queue.
          </p>

          {importState?.error && <p className="text-sm text-red-400">{importState.error}</p>}
          {importState?.success && (
            <p className="text-sm text-owned">
              Imported {importState.importedCount} title{importState.importedCount === 1 ? "" : "s"}
              {importState.skippedCount
                ? ` (${importState.skippedCount} skipped — already owned or requested).`
                : "."}
            </p>
          )}

          <button
            type="submit"
            disabled={isImporting}
            className="self-start rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {isImporting ? "Importing…" : "Import"}
          </button>
        </form>
      )}
    </div>
  );
}
