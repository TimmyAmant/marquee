"use client";

import { useState, useTransition } from "react";
import { regenerateWebhookSecretAction } from "@/app/settings/integrations/actions";
import { arrWebhookUrls } from "@/lib/integrations/webhook-urls";
import { useT } from "@/lib/i18n/client";
import { SettingRow, SettingsGroup, SettingsGroupHeader } from "@/components/settings/settings-ui";

export function WebhookUrlRow({ label, url }: { label: string; url: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex w-full flex-col gap-1.5 text-sm text-text-secondary">
      {label}
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 truncate rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-xs text-text-primary outline-none"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-full border border-border-strong px-3 py-2 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent"
        >
          {copied ? t("common.copied") : t("common.copy")}
        </button>
      </div>
    </div>
  );
}

export function WebhookSettingsCard({
  userId,
  initialSecret,
  baseUrl,
  fourK = { radarr: false, sonarr: false },
}: {
  userId: string;
  initialSecret: string;
  baseUrl: string;
  /** Which 4K instances are connected, so their own webhook URLs show. */
  fourK?: { radarr: boolean; sonarr: boolean };
}) {
  const t = useT();
  const [secret, setSecret] = useState(initialSecret);
  const [isPending, startTransition] = useTransition();

  function handleRegenerate() {
    startTransition(async () => {
      const result = await regenerateWebhookSecretAction();
      if (result.secret) setSecret(result.secret);
    });
  }

  const urls = arrWebhookUrls(baseUrl, userId, secret);

  const regenerate = (
    <button
      type="button"
      onClick={handleRegenerate}
      disabled={isPending}
      className="shrink-0 text-xs text-text-secondary transition-colors hover:text-accent disabled:opacity-60"
    >
      {isPending ? t("integrations.regenerating") : t("integrations.regenerateSecret")}
    </button>
  );
  const rows = [
    { label: t("integrations.webhookUrlFor", { app: "Radarr" }), url: urls.radarr, shown: true },
    { label: t("integrations.webhookUrlFor", { app: "Sonarr" }), url: urls.sonarr, shown: true },
    { label: t("integrations.webhookUrlFor4k", { app: "Radarr" }), url: urls.radarr4k, shown: fourK.radarr },
    { label: t("integrations.webhookUrlFor4k", { app: "Sonarr" }), url: urls.sonarr4k, shown: fourK.sonarr },
  ];

  return (
    <SettingsGroup>
      <SettingsGroupHeader
        title={t("integrations.sharedWebhooksTitle")}
        description={t("integrations.sharedWebhooksIntro")}
        status={regenerate}
      />
      {rows
        .filter((row) => row.shown)
        .map((row) => (
          <SettingRow key={row.label} label={row.label} wideControl>
            <WebhookUrlRow label="" url={row.url} />
          </SettingRow>
        ))}
    </SettingsGroup>
  );
}
