"use client";

import { ConnectionForm } from "@/components/settings/connection-form";
import { useT } from "@/lib/i18n/client";
import { testAndSaveNtfy, disconnectNtfy } from "@/app/settings/integrations/ntfy-actions";

export function NtfyConnectCard({ connected }: { connected: boolean }) {
  const t = useT();
  return (
    <ConnectionForm
      title={t("integrations.ntfyTitle")}
      description={t("integrations.ntfyIntro")}
      connected={connected}
      fields={[
        {
          name: "topicUrl",
          label: t("integrations.topicUrl"),
          type: "password",
          required: true,
          keepsSaved: true,
          placeholder: "https://ntfy.sh/your-topic-name", // i18n-ignore
        },
      ]}
      action={testAndSaveNtfy}
      remove={disconnectNtfy}
      removeLabel={t("integrations.removeSavedTopic")}
      savedText={t("integrations.ntfySuccess")}
      testedText={t("settings.testSent")}
    />
  );
}
