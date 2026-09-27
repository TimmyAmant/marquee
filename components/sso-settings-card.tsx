"use client";

import { useActionState, useState } from "react";
import {
  removeSsoSettingsAction,
  saveSsoSettingsAction,
  testSsoIssuerAction,
} from "@/app/settings/integrations/sso-actions";
import type { SsoSettingsView, SsoTestResult } from "@/lib/auth/sso/config";
import { useT } from "@/lib/i18n/client";
import { useResultToast } from "@/components/settings/use-result-toast";

const inputClass =
  "rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent";
const CALLBACK_PATH = "/api/auth/sso/callback";

function callbackFor(publicUrl: string): string {
  try {
    return `${new URL(publicUrl).origin}${CALLBACK_PATH}`;
  } catch {
    return `https://your-marquee-address${CALLBACK_PATH}`;
  }
}

function Toggle({ name, defaultChecked, label, hint }: { name: string; defaultChecked: boolean; label: string; hint: string }) {
  return (
    <label className="flex items-start gap-3 text-sm text-text-secondary">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 accent-accent" />
      <span>
        <span className="text-text-primary">{label}</span>
        <span className="mt-0.5 block text-xs text-text-muted">{hint}</span>
      </span>
    </label>
  );
}

/**
 * Settings → Integrations' "Single sign-on": any OpenID Connect provider
 * (Authentik, Authelia, Pocket ID, Keycloak, Google…). The client secret is
 * write-only — the page only knows whether one is saved.
 */
export function SsoSettingsCard({ initial, defaultPublicUrl }: { initial: SsoSettingsView | null; defaultPublicUrl: string }) {
  const t = useT();
  const [state, formAction, isPending] = useActionState(saveSsoSettingsAction, undefined);
  useResultToast(state, t("common.saved"));
  const [removed, setRemoved] = useState(false);
  const [removing, setRemoving] = useState(false);
  const saved = removed ? null : (state?.settings ?? initial);
  const [publicUrl, setPublicUrl] = useState(initial?.publicUrl ?? defaultPublicUrl);
  const [issuer, setIssuer] = useState(initial?.issuer ?? "");
  const [test, setTest] = useState<{ result?: SsoTestResult; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const callbackUrl = callbackFor(publicUrl);

  async function runTest() {
    setTesting(true);
    setTest(null);
    setTest(await testSsoIssuerAction(issuer));
    setTesting(false);
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-xl text-text-primary">{t("integrations.ssoTitle")}</h3>
          <p className="mt-1 text-xs text-text-muted">{t("integrations.ssoIntro")}</p>
        </div>
        {saved && (
          <span className="shrink-0 rounded-full border border-owned/30 bg-owned-bg px-3 py-1 text-xs text-owned">
            {t("common.on")}
          </span>
        )}
      </div>

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.ssoButtonName")}
          {/* i18n-ignore */}
          <input name="name" required maxLength={40} defaultValue={saved?.name ?? ""} placeholder="Authentik" className={inputClass} />
          <span className="text-xs text-text-muted">{t("integrations.ssoButtonNameHint")}</span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.ssoPublicUrl")}
          <input
            name="publicUrl"
            required
            value={publicUrl}
            onChange={(e) => setPublicUrl(e.target.value)}
            placeholder="https://marquee.example.com" // i18n-ignore
            className={inputClass}
          />
          <span className="text-xs text-text-muted">{t("integrations.ssoPublicUrlHint")}</span>
        </label>

        <div className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.ssoRedirectUri")}
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-xs text-text-primary">
              {callbackUrl}
            </code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(callbackUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  // Clipboard blocked: the text is selectable.
                }
              }}
              className="shrink-0 rounded-full border border-border-strong px-3 py-1.5 text-xs text-text-primary hover:border-accent hover:text-accent"
            >
              {copied ? t("common.copied") : t("common.copy")}
            </button>
          </div>
        </div>

        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.ssoIssuerUrl")}
          <div className="flex gap-2">
            <input
              name="issuer"
              required
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              placeholder="https://auth.example.com/application/o/marquee/" // i18n-ignore
              className={`${inputClass} min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={runTest}
              disabled={testing || !issuer.trim()}
              className="shrink-0 rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary hover:border-accent hover:text-accent disabled:opacity-60"
            >
              {testing ? t("integrations.testing") : t("common.test")}
            </button>
          </div>
          <span className="text-xs text-text-muted">{t("integrations.ssoIssuerHint")}</span>
        </label>
        {test?.error && <p className="text-sm text-red-400">{test.error}</p>}
        {test?.result && (
          <div className="rounded-lg border border-owned/30 bg-owned-bg px-3.5 py-2.5 text-xs text-owned">
            {t("integrations.ssoFound", { issuer: test.result.issuer })}
            {test.result.warnings.map((w) => (
              <p key={w} className="mt-1 text-amber-400">
                {w}
              </p>
            ))}
          </div>
        )}

        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.clientId")}
          <input name="clientId" required defaultValue={saved?.clientId ?? ""} className={inputClass} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.ssoClientSecret")}
          <input
            name="clientSecret"
            type="password"
            autoComplete="new-password"
            placeholder={saved?.hasClientSecret ? t("integrations.enterToReplace") : t("integrations.ssoPublicClient")}
            className={inputClass}
          />
        </label>
        {saved?.hasClientSecret && (
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <input type="checkbox" name="clearClientSecret" className="h-3.5 w-3.5 accent-accent" />
            {t("integrations.ssoRemoveSecret")}
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.ssoScopes")}
          <input name="scopes" defaultValue={saved?.scopes ?? "openid profile email"} className={inputClass} />
          <span className="text-xs text-text-muted">{t("integrations.ssoScopesHint")}</span>
        </label>

        <div className="mt-2 flex flex-col gap-3">
          <Toggle
            name="allowSignup"
            defaultChecked={saved?.allowSignup ?? false}
            label={t("integrations.ssoAllowSignup")}
            hint={t("integrations.ssoAllowSignupHint")}
          />
          <Toggle
            name="matchEmail"
            defaultChecked={saved?.matchEmail ?? false}
            label={t("integrations.ssoMatchEmail")}
            hint={t("integrations.ssoMatchEmailHint")}
          />
        </div>

        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.ssoRequiredGroup")}
          {/* i18n-ignore */}
          <input name="requiredGroup" defaultValue={saved?.requiredGroup ?? ""} placeholder="marquee-users" className={inputClass} />
          <span className="text-xs text-text-muted">{t("integrations.ssoRequiredGroupHint")}</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.ssoTrustedGroup")}
          {/* i18n-ignore */}
          <input name="trustedGroup" defaultValue={saved?.trustedGroup ?? ""} placeholder="marquee-trusted" className={inputClass} />
          <span className="text-xs text-text-muted">{t("integrations.ssoTrustedGroupHint")}</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.ssoGroupsClaim")}
          <input name="groupsClaim" defaultValue={saved?.groupsClaim ?? "groups"} className={inputClass} />
        </label>

        {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
        {state?.success && !removed && <p className="text-sm text-owned">{t("integrations.ssoSaved")}</p>}

        <button
          type="submit"
          disabled={isPending}
          onClick={() => setRemoved(false)}
          className="mt-1 self-start rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? t("integrations.checking") : t("integrations.testAndSave")}
        </button>
      </form>

      {saved && (
        <button
          type="button"
          disabled={removing}
          onClick={async () => {
            setRemoving(true);
            const result = await removeSsoSettingsAction();
            setRemoving(false);
            if (result.success) setRemoved(true);
          }}
          className="mt-3 text-xs text-text-muted underline decoration-dotted hover:text-red-400 disabled:opacity-60"
        >
          {removing ? t("integrations.ssoTurningOff") : t("integrations.ssoTurnOff")}
        </button>
      )}
    </div>
  );
}
