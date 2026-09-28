"use client";

import { useActionState } from "react";
import { useT } from "@/lib/i18n/client";
import {
  testAndSaveTraktClientId,
  disconnectTrakt,
  importTraktListAction,
} from "@/app/settings/integrations/trakt-actions";
import { ConnectionForm } from "@/components/settings/connection-form";
import { SETTINGS_INPUT, SaveBar, SettingRow, SettingsGroup } from "@/components/settings/settings-ui";
import { useResultToast } from "@/components/settings/use-result-toast";

/** Trakt's client ID, then (while connected) importing one list. */
export function TraktConnectCard({ connected }: { connected: boolean }) {
  const t = useT();
  const [importState, importFormAction, isImporting] = useActionState(importTraktListAction, undefined);
  const imported =
    importState?.success &&
    (importState.skippedCount
      ? t("integrations.traktImportedSkipped", { count: importState.importedCount ?? 0, skipped: importState.skippedCount })
      : t("integrations.traktImported", { count: importState.importedCount ?? 0 }));
  useResultToast(importState, imported || t("common.saved"));

  return (
    <>
      <ConnectionForm
        title="Trakt"
        description={t("integrations.traktIntro")}
        connected={connected}
        fields={[
          {
            name: "clientId",
            label: t("integrations.clientId"),
            type: "password",
            required: true,
            keepsSaved: true,
            placeholder: t("integrations.traktPlaceholder"),
          },
        ]}
        action={testAndSaveTraktClientId}
        remove={disconnectTrakt}
        removeLabel={t("integrations.removeSavedClientId")}
        savedText={t("integrations.connectedSuccessfully")}
      />

      {connected && (
        <form action={importFormAction}>
          <SettingsGroup>
            <SettingRow label={t("integrations.traktImportLabel")} help={t("integrations.traktImportHint")} htmlFor="trakt-import-url" wideControl>
              <input
                id="trakt-import-url"
                type="url"
                name="url"
                required
                placeholder="https://trakt.tv/users/username/lists/best-of-2024" // i18n-ignore
                className={SETTINGS_INPUT}
              />
            </SettingRow>
            <SaveBar
              label={t("integrations.import")}
              pendingLabel={t("integrations.importing")}
              pending={isImporting}
              status={
                importState?.error ? (
                  <span className="text-red-400">{importState.error}</span>
                ) : imported ? (
                  <span className="text-owned">{imported}</span>
                ) : null
              }
            />
          </SettingsGroup>
        </form>
      )}
    </>
  );
}
