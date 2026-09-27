"use client";

import { useActionState } from "react";
import { useT } from "@/lib/i18n/client";
import {
  testAndSaveTraktClientId,
  disconnectTrakt,
  importTraktListAction,
} from "@/app/settings/integrations/trakt-actions";
import { useResultToast } from "@/components/settings/use-result-toast";

export function TraktConnectCard({ connected }: { connected: boolean }) {
  const t = useT();
  const [state, formAction, isPending] = useActionState(testAndSaveTraktClientId, undefined);
  useResultToast(state, t("common.saved"));
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
          <p className="mt-1 text-xs text-text-muted">{t("integrations.traktIntro")}</p>
        </div>
        {isConnected && (
          <span className="rounded-full border border-owned/30 bg-owned-bg px-3 py-1 text-xs text-owned">
            {t("integrations.connected")}
          </span>
        )}
      </div>

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.clientId")}
          <input
            type="password"
            name="clientId"
            required
            placeholder={isConnected ? t("integrations.enterToReplace") : t("integrations.traktPlaceholder")}
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

      {isConnected && (
        <form action={disconnectAction} className="mt-3">
          <button
            type="submit"
            disabled={isDisconnecting}
            className="text-xs text-text-muted underline decoration-dotted hover:text-red-400 disabled:opacity-60"
          >
            {isDisconnecting ? t("integrations.removing") : t("integrations.removeSavedClientId")}
          </button>
          {disconnectState?.error && (
            <p className="mt-1 text-xs text-red-400">{disconnectState.error}</p>
          )}
        </form>
      )}

      {isConnected && (
        <form action={importFormAction} className="mt-5 flex flex-col gap-3 border-t border-border pt-5">
          <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
            {t("integrations.traktImportLabel")}
            <input
              type="url"
              name="url"
              required
              placeholder="https://trakt.tv/users/username/lists/best-of-2024" // i18n-ignore
              className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
            />
          </label>
          <p className="text-xs text-text-muted">{t("integrations.traktImportHint")}</p>

          {importState?.error && <p className="text-sm text-red-400">{importState.error}</p>}
          {importState?.success && (
            <p className="text-sm text-owned">
              {importState.skippedCount
                ? t("integrations.traktImportedSkipped", {
                    count: importState.importedCount ?? 0,
                    skipped: importState.skippedCount,
                  })
                : t("integrations.traktImported", { count: importState.importedCount ?? 0 })}
            </p>
          )}

          <button
            type="submit"
            disabled={isImporting}
            className="self-start rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {isImporting ? t("integrations.importing") : t("integrations.import")}
          </button>
        </form>
      )}
    </div>
  );
}
