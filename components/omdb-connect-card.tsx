"use client";

import { ConnectionForm } from "@/components/settings/connection-form";
import { useT } from "@/lib/i18n/client";
import { testAndSaveOmdbApiKey, disconnectOmdb } from "@/app/settings/integrations/omdb-actions";

export function OmdbConnectCard({ connected }: { connected: boolean }) {
  const t = useT();
  return (
    <ConnectionForm
      title={t("integrations.omdbTitle")}
      description={t("integrations.omdbIntro")}
      connected={connected}
      fields={[{ name: "apiKey", label: t("integrations.apiKey"), type: "password", required: true, keepsSaved: true, placeholder: t("integrations.omdbPlaceholder") }]}
      action={testAndSaveOmdbApiKey}
      remove={disconnectOmdb}
      removeLabel={t("integrations.removeSavedKey")}
      savedText={t("integrations.connectedSuccessfully")}
    />
  );
}
