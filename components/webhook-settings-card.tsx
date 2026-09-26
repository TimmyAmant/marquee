"use client";

import { useState, useTransition } from "react";
import { regenerateWebhookSecretAction } from "@/app/settings/integrations/actions";
import { arrWebhookUrls } from "@/lib/integrations/webhook-urls";

function WebhookUrlRow({ label, url }: { label: string; url: string }) {
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
          {copied ? "Copied" : "Copy"}
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
        <h3 className="font-display text-xl text-text-primary">Notifications</h3>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={isPending}
          className="text-xs text-text-secondary transition-colors hover:text-accent disabled:opacity-60"
        >
          {isPending ? "Regenerating…" : "Regenerate secret"}
        </button>
      </div>
      <p className="mt-2 text-sm text-text-secondary">
        Paste these into Radarr/Sonarr → Settings → Connect → Add → Webhook (method POST, trigger on
        Grab + Download) to get notified here as soon as something starts or finishes downloading.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <WebhookUrlRow label="Radarr webhook URL" url={urls.radarr} />
        <WebhookUrlRow label="Sonarr webhook URL" url={urls.sonarr} />
        {fourK.radarr && <WebhookUrlRow label="4K Radarr webhook URL" url={urls.radarr4k} />}
        {fourK.sonarr && <WebhookUrlRow label="4K Sonarr webhook URL" url={urls.sonarr4k} />}
      </div>
    </div>
  );
}
