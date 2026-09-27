"use client";

import { useState, useTransition } from "react";
import { createApiKeyAction, revokeApiKeyAction } from "@/app/settings/integrations/api-key-actions";
import {
  apiKeyExpiryChoices,
  apiKeyActAsLabel,
  apiKeyCreatedLabel,
  apiKeyExpiryLabel,
  apiKeyLastUsedLabel,
  apiKeyScopeLabel,
} from "@/lib/api/api-key-labels";
import type { ApiKey, ApiKeyCreated } from "@/lib/api/types";
import { useT } from "@/lib/i18n/client";
import { rich } from "@/lib/i18n/rich";

const inputClass =
  "rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-sm text-text-primary outline-none transition-colors focus:border-accent";
const smallButton =
  "shrink-0 rounded-full border border-border-strong px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60";

/**
 * Settings › Integrations › API keys: keys for dashboards (Homepage,
 * Homarr), phone apps and scripts. A new key's secret is shown once, right
 * after it's made; the list only ever has its first few characters.
 */
export function ApiKeysCard({
  initialKeys,
  members,
}: {
  initialKeys: ApiKey[];
  /** Household members a key can act as (everyone but the admin). */
  members: { id: string; label: string }[];
}) {
  const t = useT();
  const [keys, setKeys] = useState(initialKeys);
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [now] = useState(() => Date.now());

  function handleCreate(formData: FormData) {
    const expiry = String(formData.get("expiresInDays") ?? "");
    const actAs = String(formData.get("actAsUserId") ?? "");
    setError(null);
    startTransition(async () => {
      const result = await createApiKeyAction({
        name: String(formData.get("name") ?? ""),
        scope: String(formData.get("scope") ?? ""),
        actAsUserId: actAs || null,
        expiresInDays: expiry ? Number(expiry) : null,
      });
      if (result.error) setError(result.error);
      if (result.keys) setKeys(result.keys);
      if (result.created) {
        setCreated(result.created);
        setCopied(false);
      }
    });
  }

  function handleRevoke(key: ApiKey) {
    if (!window.confirm(t("integrations.apiKeyRevokeConfirm", { name: key.name }))) return;
    setError(null);
    startTransition(async () => {
      const result = await revokeApiKeyAction(key.id);
      if (result.error) setError(result.error);
      if (result.keys) setKeys(result.keys);
      if (created?.apiKey.id === key.id) setCreated(null);
    });
  }

  async function handleCopy() {
    if (!created) return;
    await navigator.clipboard.writeText(created.key).catch(() => undefined);
    setCopied(true);
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-6">
      <h3 className="font-display text-xl text-text-primary">{t("integrations.apiKeysTitle")}</h3>
      <p className="mt-1 text-xs text-text-muted">
        {rich(t("integrations.apiKeysIntro"), {
          link: (chunks) => (
            <a href="/api-docs" className="text-accent hover:underline">
              {chunks}
            </a>
          ),
        })}
      </p>

      {created && (
        <div className="mt-4 rounded-xl border border-accent/40 bg-bg-0 p-4">
          <p className="text-sm text-text-primary">{t("integrations.apiKeyCopyNow")}</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={created.key}
              aria-label={t("integrations.apiKeyFieldLabel", { name: created.apiKey.name })}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-border bg-bg-1 px-3.5 py-2.5 font-mono text-xs text-text-primary outline-none"
            />
            <button type="button" onClick={handleCopy} className={smallButton}>
              {copied ? t("common.copied") : t("common.copy")}
            </button>
            <button type="button" onClick={() => setCreated(null)} className={smallButton}>
              {t("common.done")}
            </button>
          </div>
        </div>
      )}

      {keys.length > 0 ? (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {keys.map((key) => {
            const actAs = apiKeyActAsLabel(t, key);
            return (
              <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-text-primary">
                    {key.name}{" "}
                    <span className="ml-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-text-secondary">
                      {apiKeyScopeLabel(t, key.scope)}
                    </span>
                    {actAs && <span className="ml-2 text-xs text-text-secondary">{actAs}</span>}
                  </p>
                  <p className={`mt-0.5 text-xs ${key.expired ? "text-red-400" : "text-text-muted"}`}>
                    <code className="font-mono">{key.hint}…</code> · {apiKeyCreatedLabel(t, key)} ·{" "}
                    {apiKeyLastUsedLabel(t, key, new Date(now))} · {apiKeyExpiryLabel(t, key)}
                  </p>
                </div>
                <button type="button" onClick={() => handleRevoke(key)} disabled={isPending} className={smallButton}>
                  {t("integrations.revoke")}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-text-secondary">{t("integrations.noApiKeys")}</p>
      )}

      <form action={handleCreate} className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary sm:col-span-2">
          {t("integrations.name")}
          <input name="name" required maxLength={80} placeholder="Homepage" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.apiKeyAccess")}
          <select name="scope" defaultValue="read" className={inputClass}>
            <option value="read">{t("integrations.apiKeyReadOnly")}</option>
            <option value="full">{t("integrations.apiKeyFullAccess")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.apiKeyExpiresField")}
          <select name="expiresInDays" defaultValue="" className={inputClass}>
            {apiKeyExpiryChoices(t).map((choice) => (
              <option key={choice.label} value={choice.days ?? ""}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary sm:col-span-2">
          {t("integrations.apiKeyActAsField")}
          <select name="actAsUserId" defaultValue="" className={inputClass}>
            <option value="">{t("integrations.apiKeyActAsAdmin")}</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-text-muted">{t("integrations.apiKeyActAsHint")}</span>
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {isPending ? t("integrations.working") : t("integrations.createKey")}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </form>
    </div>
  );
}
