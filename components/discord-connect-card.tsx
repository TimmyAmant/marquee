"use client";

import { ConnectionForm } from "@/components/settings/connection-form";
import { useT } from "@/lib/i18n/client";
import { testAndSaveDiscordWebhook, disconnectDiscord } from "@/app/settings/integrations/discord-actions";

export function DiscordConnectCard({ connected }: { connected: boolean }) {
  const t = useT();
  return (
    <ConnectionForm
      title={t("integrations.discordTitle")}
      description={t("integrations.discordIntro")}
      connected={connected}
      fields={[
        {
          name: "webhookUrl",
          label: t("integrations.webhookUrl"),
          type: "password",
          required: true,
          keepsSaved: true,
          placeholder: t("integrations.discordPlaceholder"),
        },
      ]}
      action={testAndSaveDiscordWebhook}
      remove={disconnectDiscord}
      removeLabel={t("integrations.removeSavedWebhook")}
      savedText={t("integrations.discordSuccess")}
      testedText={t("settings.testSent")}
    />
  );
}
