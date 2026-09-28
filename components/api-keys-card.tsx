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
import { showToast } from "@/components/toast";
import { SETTINGS_INPUT, SaveBar, SettingRow, SettingsGroup, SettingsGroupHeader } from "@/components/settings/settings-ui";
const smallButton =
  "shrink-0 rounded-full border border-border-strong px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60";

/**
 * Settings › General › API keys: keys for dashboards (Homepage,
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
      if (result.error) {
        setError(result.error);
        showToast(result.error, "error");
      }
      if (result.keys) setKeys(result.keys);
      if (result.created) {
        showToast(t("common.saved"));
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
    <div className="flex flex-col gap-4">
      <SettingsGroup>
        <SettingsGroupHeader
          title={t("integrations.apiKeysTitle")}
          description={rich(t("integrations.apiKeysIntro"), {
            link: (chunks) => (
              <a href="/api-docs" className="text-accent hover:underline">
                {chunks}
              </a>
            ),
          })}
        />

        {created && (
          <div className="bg-accent/5 px-5 py-4">
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
          keys.map((key) => {
            const actAs = apiKeyActAsLabel(t, key);
            return (
              <SettingRow
                key={key.id}
                label={
                  <>
                    {key.name}{" "}
                    <span className="ml-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-normal text-text-secondary">
                      {apiKeyScopeLabel(t, key.scope)}
                    </span>
                    {actAs && <span className="ml-2 text-xs font-normal text-text-secondary">{actAs}</span>}
                  </>
                }
                help={
                  <span className={key.expired ? "text-red-400" : undefined}>
                    <code className="font-mono">{key.hint}…</code> · {apiKeyCreatedLabel(t, key)} ·{" "}
                    {apiKeyLastUsedLabel(t, key, new Date(now))} · {apiKeyExpiryLabel(t, key)}
                  </span>
                }
              >
                <button type="button" onClick={() => handleRevoke(key)} disabled={isPending} className={smallButton}>
                  {t("integrations.revoke")}
                </button>
              </SettingRow>
            );
          })
        ) : (
          <p className="px-5 py-4 text-sm text-text-secondary">{t("integrations.noApiKeys")}</p>
        )}
      </SettingsGroup>

      <form action={handleCreate}>
        <SettingsGroup>
          <SettingsGroupHeader title={t("integrations.createKey")} />
          <SettingRow label={t("integrations.name")} htmlFor="api-key-name" wideControl>
            {/* i18n-ignore */}
            <input id="api-key-name" name="name" required maxLength={80} placeholder="Homepage" className={SETTINGS_INPUT} />
          </SettingRow>
          <SettingRow label={t("integrations.apiKeyAccess")} htmlFor="api-key-scope" wideControl>
            <select id="api-key-scope" name="scope" defaultValue="read" className={SETTINGS_INPUT}>
              <option value="read">{t("integrations.apiKeyReadOnly")}</option>
              <option value="full">{t("integrations.apiKeyFullAccess")}</option>
            </select>
          </SettingRow>
          <SettingRow label={t("integrations.apiKeyExpiresField")} htmlFor="api-key-expiry" wideControl>
            <select id="api-key-expiry" name="expiresInDays" defaultValue="" className={SETTINGS_INPUT}>
              {apiKeyExpiryChoices(t).map((choice) => (
                <option key={choice.label} value={choice.days ?? ""}>
                  {choice.label}
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow label={t("integrations.apiKeyActAsField")} help={t("integrations.apiKeyActAsHint")} htmlFor="api-key-act-as" wideControl>
            <select id="api-key-act-as" name="actAsUserId" defaultValue="" className={SETTINGS_INPUT}>
              <option value="">{t("integrations.apiKeyActAsAdmin")}</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.label}
                </option>
              ))}
            </select>
          </SettingRow>
          <SaveBar
            label={t("integrations.createKey")}
            pendingLabel={t("integrations.working")}
            pending={isPending}
            status={error && <span className="text-red-400">{error}</span>}
          />
        </SettingsGroup>
      </form>
    </div>
  );
}
