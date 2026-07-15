"use client";

import { useActionState } from "react";
import {
  testAndSaveArrConnection,
  saveArrDefaults,
  type ArrConnectionState,
} from "@/app/settings/integrations/actions";
import type { ArrProvider } from "@/lib/db/schema";

export function ArrCredentialForm({
  provider,
  label,
  existing,
}: {
  provider: ArrProvider;
  label: string;
  existing: {
    baseUrl: string;
    hasApiKey: boolean;
    rootFolderPath: string | null;
    qualityProfileId: number | null;
  } | null;
}) {
  const action = testAndSaveArrConnection.bind(null, provider);
  const [state, formAction, isPending] = useActionState<ArrConnectionState | undefined, FormData>(
    action,
    undefined,
  );

  const rootFolders = state?.rootFolders;
  const qualityProfiles = state?.qualityProfiles;
  const showDefaults = Boolean(rootFolders?.length && qualityProfiles?.length);

  const saveDefaultsAction = saveArrDefaults.bind(null, provider);

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-text-primary">{label}</h3>
        {existing?.hasApiKey && (
          <span className="rounded-full border border-owned/30 bg-owned-bg px-3 py-1 text-xs text-owned">
            Connected
          </span>
        )}
      </div>

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Server URL
          <input
            type="url"
            name="baseUrl"
            required
            defaultValue={existing?.baseUrl ?? ""}
            placeholder={`http://localhost:${provider === "sonarr" ? "8989" : "7878"}`}
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
        {state?.success && !showDefaults && (
          <p className="text-sm text-owned">Connected successfully.</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="mt-1 self-start rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? "Testing…" : "Test & save"}
        </button>
      </form>

      {showDefaults && (
        <form action={saveDefaultsAction} className="mt-5 flex flex-col gap-3 border-t border-border pt-5">
          <p className="text-sm text-text-secondary">Defaults used when adding new titles:</p>
          <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
            Root folder
            <select
              name="rootFolderPath"
              defaultValue={state?.selectedRootFolder ?? existing?.rootFolderPath ?? ""}
              className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
            >
              {rootFolders?.map((folder) => (
                <option key={folder.id} value={folder.path}>
                  {folder.path}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
            Quality profile
            <select
              name="qualityProfileId"
              defaultValue={state?.selectedQualityProfileId ?? existing?.qualityProfileId ?? ""}
              className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
            >
              {qualityProfiles?.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="self-start rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent"
          >
            Save defaults
          </button>
        </form>
      )}
    </div>
  );
}
