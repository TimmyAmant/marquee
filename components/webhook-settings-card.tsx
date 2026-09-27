"use client";

import { useState, useTransition } from "react";
import { regenerateWebhookSecretAction } from "@/app/settings/integrations/actions";
import { arrWebhookUrls } from "@/lib/integrations/webhook-urls";
import { useT } from "@/lib/i18n/client";

export function WebhookUrlRow({ label, url }: { label: string; url: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-1.5 text-sm text-text-secondary">
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

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-text-primary">{t("integrations.sharedWebhooksTitle")}</h3>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={isPending}
          className="text-xs text-text-secondary transition-colors hover:text-accent disabled:opacity-60"
        >
          {isPending ? t("integrations.regenerating") : t("integrations.regenerateSecret")}
        </button>
      </div>
      <p className="mt-2 text-sm text-text-secondary">{t("integrations.sharedWebhooksIntro")}</p>
      <div className="mt-4 flex flex-col gap-3">
        <WebhookUrlRow label={t("integrations.webhookUrlFor", { app: "Radarr" })} url={urls.radarr} />
        <WebhookUrlRow label={t("integrations.webhookUrlFor", { app: "Sonarr" })} url={urls.sonarr} />
        {fourK.radarr && <WebhookUrlRow label={t("integrations.webhookUrlFor4k", { app: "Radarr" })} url={urls.radarr4k} />}
        {fourK.sonarr && <WebhookUrlRow label={t("integrations.webhookUrlFor4k", { app: "Sonarr" })} url={urls.sonarr4k} />}
      </div>
    </div>
  );
}
