"use client";

import { useActionState } from "react";
import { testAndSaveJellyfinConnection, type JellyfinConnectionState } from "@/app/settings/integrations/jellyfin-actions";
import { DisconnectButton } from "@/components/disconnect-button";
import { useT } from "@/lib/i18n/client";
import { useResultToast } from "@/components/settings/use-result-toast";

export function JellyfinConnectCard({
  existing,
  summary,
  name,
}: {
  existing: { baseUrl: string; publicUrl?: string | null; hasApiKey: boolean } | null;
  /** "Jellyfin" or "Emby" once connected and synced; null before. */
  name?: string | null;
  summary: {
    servers: { name: string | null; lastSyncedAt: string | null }[];
    movieCount: number;
    tvCount: number;
  };
}) {
  const t = useT();
  const [state, formAction, isPending] = useActionState<JellyfinConnectionState | undefined, FormData>(
    testAndSaveJellyfinConnection,
    undefined,
  );
  useResultToast(state, t("common.saved"));

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-xl text-text-primary">{t("integrations.jellyfinTitle")}</h3>
          <p className="mt-1 text-xs text-text-muted">
            {name ? t("integrations.jellyfinIntroConnected", { name }) : t("integrations.jellyfinIntro")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {existing?.hasApiKey && (
            <span className="rounded-full border border-owned/30 bg-owned-bg px-3 py-1 text-xs text-owned">
              {t("integrations.connected")}
            </span>
          )}
          {existing?.hasApiKey && <DisconnectButton provider="jellyfin" label="Jellyfin" />}
        </div>
      </div>

      {existing?.hasApiKey && (
        <p className="mt-2 text-sm text-text-secondary">
          {summary.servers.length > 0 && `${summary.servers.map((s) => s.name).join(", ")} · `}
          {t("integrations.librarySummary", { movies: summary.movieCount, shows: summary.tvCount })}
        </p>
      )}

      <p className="mt-2 text-sm text-text-secondary">{t("integrations.jellyfinApiKeyHelp")}</p>

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.serverUrl")}
          <input
            type="url"
            name="baseUrl"
            required
            defaultValue={existing?.baseUrl ?? ""}
            placeholder="http://localhost:8096" // i18n-ignore
            className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.publicUrl")}
          <input
            type="url"
            name="publicUrl"
            defaultValue={existing?.publicUrl ?? ""}
            placeholder="https://jellyfin.example.com" // i18n-ignore
            className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
          />
          <span className="text-xs text-text-muted">{t("integrations.publicUrlHelp")}</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.apiKey")}
          <input
            type="password"
            name="apiKey"
            required
            placeholder={existing?.hasApiKey ? t("integrations.enterToReplace") : ""}
            className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
          />
        </label>

        {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
        {state?.success && <p className="text-sm text-owned">{t("integrations.connectedSuccessfully")}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="mt-1 self-start rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? t("integrations.testing") : t("integrations.testAndSave")}
        </button>
      </form>
    </div>
  );
}
