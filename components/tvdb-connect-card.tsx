"use client";

import { ConnectionForm } from "@/components/settings/connection-form";
import { useT } from "@/lib/i18n/client";
import { testAndSaveTvdbApiKey, disconnectTvdb } from "@/app/settings/integrations/tvdb-actions";

export function TvdbConnectCard({ connected }: { connected: boolean }) {
  const t = useT();
  return (
    <ConnectionForm
      title="TheTVDB"
      description={t("integrations.tvdbIntro")}
      connected={connected}
      fields={[{ name: "apiKey", label: t("integrations.apiKey"), type: "password", required: true, keepsSaved: true, placeholder: t("integrations.tvdbPlaceholder") }]}
      action={testAndSaveTvdbApiKey}
      remove={disconnectTvdb}
      removeLabel={t("integrations.removeSavedKey")}
      savedText={t("integrations.connectedSuccessfully")}
    />
  );
}
