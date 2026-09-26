"use client";

import { useState, useTransition } from "react";
import { createApiKeyAction, revokeApiKeyAction } from "@/app/settings/integrations/api-key-actions";
import {
  API_KEY_EXPIRY_CHOICES,
  apiKeyActAsLabel,
  apiKeyCreatedLabel,
  apiKeyExpiryLabel,
  apiKeyLastUsedLabel,
  apiKeyScopeLabel,
} from "@/lib/api/api-key-labels";
import type { ApiKey, ApiKeyCreated } from "@/lib/api/types";

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
    if (!window.confirm(`Revoke “${key.name}”? Anything using it stops working straight away.`)) return;
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
      <h3 className="font-display text-xl text-text-primary">API keys</h3>
      <p className="mt-1 text-xs text-text-muted">
        Let dashboards like Homepage or Homarr, scripts and other apps use Marquee. A key works like signing in, so keep it
        secret. Read-only keys can look but not change anything; no key can manage keys or these settings.{" "}
        <a href="/api-docs" className="text-accent hover:underline">
          API reference
        </a>
      </p>

      {created && (
        <div className="mt-4 rounded-xl border border-accent/40 bg-bg-0 p-4">
          <p className="text-sm text-text-primary">
            Copy this key now — it won&apos;t be shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={created.key}
              aria-label={`API key for ${created.apiKey.name}`}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-border bg-bg-1 px-3.5 py-2.5 font-mono text-xs text-text-primary outline-none"
            />
            <button type="button" onClick={handleCopy} className={smallButton}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" onClick={() => setCreated(null)} className={smallButton}>
              Done
            </button>
          </div>
        </div>
      )}

      {keys.length > 0 ? (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {keys.map((key) => {
            const actAs = apiKeyActAsLabel(key);
            return (
              <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-text-primary">
                    {key.name}{" "}
                    <span className="ml-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-text-secondary">
                      {apiKeyScopeLabel(key.scope)}
                    </span>
                    {actAs && <span className="ml-2 text-xs text-text-secondary">{actAs}</span>}
                  </p>
                  <p className={`mt-0.5 text-xs ${key.expired ? "text-red-400" : "text-text-muted"}`}>
                    <code className="font-mono">{key.hint}…</code> · {apiKeyCreatedLabel(key)} ·{" "}
                    {apiKeyLastUsedLabel(key, new Date(now))} · {apiKeyExpiryLabel(key)}
                  </p>
                </div>
                <button type="button" onClick={() => handleRevoke(key)} disabled={isPending} className={smallButton}>
                  Revoke
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-text-secondary">No API keys yet.</p>
      )}

      <form action={handleCreate} className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary sm:col-span-2">
          Name
          <input name="name" required maxLength={80} placeholder="Homepage" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Access
          <select name="scope" defaultValue="read" className={inputClass}>
            <option value="read">Read-only</option>
            <option value="full">Full access</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Expires
          <select name="expiresInDays" defaultValue="" className={inputClass}>
            {API_KEY_EXPIRY_CHOICES.map((choice) => (
              <option key={choice.label} value={choice.days ?? ""}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary sm:col-span-2">
          Act as
          <select name="actAsUserId" defaultValue="" className={inputClass}>
            <option value="">You (the admin)</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-text-muted">
            A key acting as a member can only do what they can — right for an app that just makes requests.
          </span>
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {isPending ? "Working…" : "Create key"}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </form>
    </div>
  );
}
