"use client";

import { ConnectionForm } from "@/components/settings/connection-form";
import { StatusPill } from "@/components/settings/settings-ui";
import { useT } from "@/lib/i18n/client";
import { testAndSaveTmdbToken, disconnectTmdb } from "@/app/settings/integrations/tmdb-actions";

export function TmdbSettingsForm({
  savedInSettings,
  configuredFromEnv,
}: {
  savedInSettings: boolean;
  configuredFromEnv: boolean;
}) {
  const t = useT();
  return (
    <ConnectionForm
      title="TMDb"
      description={t("integrations.tmdbIntro")}
      badge={configuredFromEnv ? <StatusPill tone="muted">{t("integrations.tmdbFromEnv")}</StatusPill> : undefined}
      connected={savedInSettings}
      fields={[
        {
          name: "accessToken",
          label: t("integrations.tmdbTokenLabel"),
          type: "password",
          required: true,
          keepsSaved: true,
          placeholder: t("integrations.tmdbPlaceholder"),
        },
      ]}
      action={testAndSaveTmdbToken}
      remove={disconnectTmdb}
      removeLabel={t("integrations.removeSavedToken")}
      savedText={t("integrations.connectedSuccessfully")}
    />
  );
}
