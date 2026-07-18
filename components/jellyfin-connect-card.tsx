"use client";

import { useActionState } from "react";
import { testAndSaveJellyfinConnection, type JellyfinConnectionState } from "@/app/settings/integrations/jellyfin-actions";
import { DisconnectButton } from "@/components/disconnect-button";

export function JellyfinConnectCard({
  existing,
  summary,
}: {
  existing: { baseUrl: string; hasApiKey: boolean } | null;
  summary: {
    servers: { name: string | null; lastSyncedAt: string | null }[];
    movieCount: number;
    tvCount: number;
  };
}) {
  const [state, formAction, isPending] = useActionState<JellyfinConnectionState | undefined, FormData>(
    testAndSaveJellyfinConnection,
    undefined,
  );

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-text-primary">Jellyfin</h3>
        <div className="flex items-center gap-3">
          {existing?.hasApiKey && (
            <span className="rounded-full border border-owned/30 bg-owned-bg px-3 py-1 text-xs text-owned">
              Connected
            </span>
          )}
          {existing?.hasApiKey && <DisconnectButton provider="jellyfin" label="Jellyfin" />}
        </div>
      </div>

      {existing?.hasApiKey && (
        <p className="mt-2 text-sm text-text-secondary">
          {summary.servers.length > 0 && `${summary.servers.map((s) => s.name).join(", ")} · `}
          {summary.movieCount} movies · {summary.tvCount} TV shows
        </p>
      )}

      <p className="mt-2 text-sm text-text-secondary">
        Generate an API key from Jellyfin&apos;s dashboard: Administration → API Keys.
      </p>

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Server URL
          <input
            type="url"
            name="baseUrl"
            required
            defaultValue={existing?.baseUrl ?? ""}
            placeholder="http://localhost:8096"
            className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          API key
          <input
            type="password"
            name="apiKey"
            required
            placeholder={existing?.hasApiKey ? "•••••••••••••••• (enter to replace)" : ""}
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
    </div>
  );
}
