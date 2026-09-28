"use client";

import { ConnectionForm } from "@/components/settings/connection-form";
import { useT } from "@/lib/i18n/client";
import { testAndSaveGenericWebhook, disconnectGenericWebhook } from "@/app/settings/integrations/webhook-actions";

export function WebhookConnectCard({ connected }: { connected: boolean }) {
  const t = useT();
  return (
    <ConnectionForm
      title={t("integrations.customWebhookTitle")}
      description={t("integrations.customWebhookIntro", { payload: "{ event, title, message }" })}
      connected={connected}
      fields={[
        {
          name: "webhookUrl",
          label: t("integrations.webhookUrl"),
          type: "password",
          required: true,
          keepsSaved: true,
          placeholder: "https://your-endpoint.example.com/hook", // i18n-ignore
        },
      ]}
      action={testAndSaveGenericWebhook}
      remove={disconnectGenericWebhook}
      removeLabel={t("integrations.removeSavedWebhook")}
      savedText={t("integrations.customWebhookSuccess")}
      testedText={t("settings.testSent")}
    />
  );
}
